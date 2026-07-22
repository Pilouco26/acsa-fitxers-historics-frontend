import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useMutation } from "@tanstack/react-query";
import {
  assignDocuments,
  cancelJob,
  guessMediaRoute,
  listPictures,
  listVideos,
  startAnalyzeJob,
  startMediaAnalyzeJob,
  ApiError,
  UNAUTHORIZED_MESSAGE,
  isUnauthorizedError,
} from "@/api/client";
import { useAuth } from "@/contexts/AuthContext";
import { useJobPolling } from "@/hooks/useJobPolling";
import type { JobOut, MediaAnalyzeResultFile, MediaKind } from "@/api/types";
import {
  DOCUMENT_STATUS_PENDING,
  DOCUMENT_STATUS_REVISIO,
} from "@/constants/globals";

export type ClassificadorContentKind = "documents" | "media";

interface ClassificadorJobContextValue {
  jobId: string | null;
  job: JobOut | null;
  error: string | null;
  authError: boolean;
  isStarting: boolean;
  isAssigning: boolean;
  isRouting: boolean;
  busy: boolean;
  isActive: boolean;
  contentKind: ClassificadorContentKind | null;
  /** Kinds finished in the current run (for success copy). */
  completedKinds: ClassificadorContentKind[];
  startAnalyze: () => void;
  cancel: () => void;
}

function mediaAnalyzeFiles(
  result: Record<string, unknown> | null | undefined,
): MediaAnalyzeResultFile[] {
  if (!result || !Array.isArray(result.files)) return [];
  return result.files.filter((entry): entry is MediaAnalyzeResultFile => {
    if (entry == null || typeof entry !== "object") return false;
    const file = entry as MediaAnalyzeResultFile;
    return (
      typeof file.id === "number" &&
      (file.kind === "picture" || file.kind === "video")
    );
  });
}

function jobHadWork(job: JobOut | null): boolean {
  if (!job) return false;

  const progress = job.progress;
  if (progress) {
    if (typeof progress.total === "number") return progress.total > 0;
    if (typeof progress.processed === "number") return progress.processed > 0;
    const counts = progress.status_counts;
    if (counts && Object.keys(counts).length > 0) {
      return Object.values(counts).some((value) => value > 0);
    }
  }

  const files = mediaAnalyzeFiles(job.result);
  if (files.length > 0) return true;

  const summary = job.result?.summary;
  if (summary && typeof summary === "object") {
    const s = summary as { total?: unknown; processed?: unknown };
    if (typeof s.total === "number") return s.total > 0;
    if (typeof s.processed === "number") return s.processed > 0;
  }

  // No empty signal — assume work so assign/route still runs for real jobs.
  return true;
}

async function listRevisioMediaForRouting(): Promise<
  { id: number; kind: MediaKind }[]
> {
  const [pictures, videos] = await Promise.all([
    listPictures({ status: DOCUMENT_STATUS_REVISIO, limit: 200 }),
    listVideos({ status: DOCUMENT_STATUS_REVISIO, limit: 200 }),
  ]);
  return [
    ...(pictures.items ?? []).map((item) => ({
      id: item.id,
      kind: "picture" as const,
    })),
    ...(videos.items ?? []).map((item) => ({
      id: item.id,
      kind: "video" as const,
    })),
  ];
}

async function hasPendingMedia(): Promise<boolean> {
  const [pictures, videos] = await Promise.all([
    listPictures({ status: DOCUMENT_STATUS_PENDING, limit: 1 }),
    listVideos({ status: DOCUMENT_STATUS_PENDING, limit: 1 }),
  ]);
  return (pictures.total ?? 0) + (videos.total ?? 0) > 0;
}

const ClassificadorJobContext =
  createContext<ClassificadorJobContextValue | null>(null);

export function ClassificadorJobProvider({ children }: { children: ReactNode }) {
  const { apiMode, isAdmin } = useAuth();
  const [jobId, setJobId] = useState<string | null>(null);
  const [job, setJob] = useState<JobOut | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [authError, setAuthError] = useState(false);
  const [isAssigning, setIsAssigning] = useState(false);
  const [isRouting, setIsRouting] = useState(false);
  const [isProbing, setIsProbing] = useState(false);
  const [contentKind, setContentKind] =
    useState<ClassificadorContentKind | null>(null);
  const [completedKinds, setCompletedKinds] = useState<
    ClassificadorContentKind[]
  >([]);
  const assignedForJobRef = useRef<string | null>(null);
  const routedForJobRef = useRef<string | null>(null);
  const advancedForJobRef = useRef<string | null>(null);
  const queueRef = useRef<ClassificadorContentKind[]>([]);
  const completedKindsRef = useRef<ClassificadorContentKind[]>([]);
  const analyzeDocumentsRef = useRef<() => void>(() => {});
  const analyzeMediaRef = useRef<() => void>(() => {});

  const stopForUnauthorized = useCallback(() => {
    setAuthError(true);
    setError(UNAUTHORIZED_MESSAGE);
    setJobId(null);
    setJob(null);
    setIsAssigning(false);
    setIsRouting(false);
    queueRef.current = [];
  }, []);

  const handlePollingError = useCallback(
    (err: unknown) => {
      if (isUnauthorizedError(err)) {
        stopForUnauthorized();
        return false;
      }
      return true;
    },
    [stopForUnauthorized],
  );

  useJobPolling(jobId, 2000, setJob, handlePollingError);

  useEffect(() => {
    if (!jobId || job?.status !== "completed") return;
    if (contentKind !== "documents") return;
    if (assignedForJobRef.current === jobId) return;
    assignedForJobRef.current = jobId;

    // Empty inbox scan: skip assign and let the advance effect continue / report none.
    if (!jobHadWork(job)) {
      setIsAssigning(false);
      return;
    }

    let cancelled = false;
    setIsAssigning(true);

    assignDocuments({
      source: "inbox",
      dest: "archive",
      require_review: true,
      run_assign: true,
      dry_run: false,
    })
      .then(() => {
        if (!cancelled) setError(null);
      })
      .catch((err) => {
        if (!cancelled) {
          if (isUnauthorizedError(err)) {
            stopForUnauthorized();
            return;
          }
          setError(
            err instanceof ApiError ? err.message : "Error en l'assignació",
          );
          queueRef.current = [];
        }
      })
      .finally(() => {
        if (!cancelled) setIsAssigning(false);
      });

    return () => {
      cancelled = true;
    };
  }, [jobId, job, job?.status, contentKind, stopForUnauthorized]);

  useEffect(() => {
    if (!jobId || job?.status !== "completed") return;
    if (contentKind !== "media") return;
    if (routedForJobRef.current === jobId) return;
    routedForJobRef.current = jobId;

    if (!jobHadWork(job)) {
      setIsRouting(false);
      return;
    }

    let cancelled = false;
    setIsRouting(true);

    (async () => {
      try {
        const fromJob = mediaAnalyzeFiles(job.result);
        const targets =
          fromJob.length > 0
            ? fromJob.map((file) => ({ id: file.id, kind: file.kind }))
            : await listRevisioMediaForRouting();

        const results = await Promise.allSettled(
          targets.map(({ id, kind }) => guessMediaRoute(id, kind)),
        );
        const failures = results.filter(
          (result) => result.status === "rejected",
        );
        if (!cancelled) {
          if (failures.length > 0) {
            const first = failures[0];
            const err =
              first.status === "rejected" ? first.reason : undefined;
            if (isUnauthorizedError(err)) {
              stopForUnauthorized();
              return;
            }
            setError(
              err instanceof ApiError
                ? err.message
                : "Error en calcular la carpeta de destinació",
            );
            queueRef.current = [];
          } else {
            setError(null);
          }
        }
      } catch (err) {
        if (!cancelled) {
          if (isUnauthorizedError(err)) {
            stopForUnauthorized();
            return;
          }
          setError(
            err instanceof ApiError
              ? err.message
              : "Error en calcular la carpeta de destinació",
          );
          queueRef.current = [];
        }
      } finally {
        if (!cancelled) setIsRouting(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [jobId, job, job?.status, job?.result, contentKind, stopForUnauthorized]);

  useEffect(() => {
    if (job?.status === "failed" || job?.status === "cancelled") {
      queueRef.current = [];
    }
  }, [job?.status]);

  const analyzeDocumentsMutation = useMutation({
    mutationFn: () => {
      if (isAdmin && !apiMode) {
        return Promise.reject(
          new ApiError(
            400,
            "Trieu Personal o Empresa al selector de mode abans d'analitzar.",
          ),
        );
      }
      return startAnalyzeJob({
        source: "inbox",
        require_review: true,
        run_assign: false,
        force: false,
        dry_run: false,
        ...(apiMode ? { mode: apiMode } : {}),
      });
    },
    onSuccess: (data) => {
      assignedForJobRef.current = null;
      routedForJobRef.current = null;
      advancedForJobRef.current = null;
      setIsAssigning(false);
      setIsRouting(false);
      setContentKind("documents");
      setAuthError(false);
      setJobId(data.job_id);
      setJob(null);
      setError(null);
    },
    onError: (err) => {
      queueRef.current = [];
      if (isUnauthorizedError(err)) {
        setAuthError(true);
        setError(UNAUTHORIZED_MESSAGE);
        return;
      }
      setAuthError(false);
      setError(
        err instanceof ApiError ? err.message : "Error en iniciar l'anàlisi",
      );
    },
  });

  const analyzeMediaMutation = useMutation({
    mutationFn: () => {
      if (isAdmin && !apiMode) {
        return Promise.reject(
          new ApiError(
            400,
            "Trieu Personal o Empresa al selector de mode abans d'analitzar.",
          ),
        );
      }
      return startMediaAnalyzeJob({
        source: "media",
        require_review: true,
        dry_run: false,
        ...(apiMode ? { mode: apiMode } : {}),
      });
    },
    onSuccess: (data) => {
      assignedForJobRef.current = null;
      routedForJobRef.current = null;
      advancedForJobRef.current = null;
      setIsAssigning(false);
      setIsRouting(false);
      setContentKind("media");
      setAuthError(false);
      setJobId(data.job_id);
      setJob(null);
      setError(null);
    },
    onError: (err) => {
      queueRef.current = [];
      if (isUnauthorizedError(err)) {
        setAuthError(true);
        setError(UNAUTHORIZED_MESSAGE);
        return;
      }
      if (err instanceof ApiError && err.status === 409) {
        setAuthError(false);
        setError(
          "Ja hi ha una anàlisi en curs. Espereu que acabi o cancel·leu-la.",
        );
        return;
      }
      setAuthError(false);
      setError(
        err instanceof ApiError ? err.message : "Error en iniciar l'anàlisi",
      );
    },
  });

  analyzeDocumentsRef.current = () => analyzeDocumentsMutation.mutate();
  analyzeMediaRef.current = () => analyzeMediaMutation.mutate();

  const startKind = useCallback((kind: ClassificadorContentKind) => {
    if (kind === "media") {
      analyzeMediaRef.current();
    } else {
      analyzeDocumentsRef.current();
    }
  }, []);

  // After a kind finishes (job + assign/route), record work and start the next queued kind.
  useEffect(() => {
    if (!jobId || job?.status !== "completed") return;
    if (contentKind == null) return;
    if (isAssigning || isRouting) return;

    if (contentKind === "documents") {
      if (assignedForJobRef.current !== jobId) return;
    } else if (routedForJobRef.current !== jobId) {
      return;
    }

    if (advancedForJobRef.current === jobId) return;
    advancedForJobRef.current = jobId;

    const hadWork = jobHadWork(job);
    if (hadWork && !completedKindsRef.current.includes(contentKind)) {
      completedKindsRef.current = [...completedKindsRef.current, contentKind];
      setCompletedKinds(completedKindsRef.current);
    }

    const next = queueRef.current[0];
    if (next) {
      queueRef.current = queueRef.current.slice(1);
      startKind(next);
      return;
    }

    if (completedKindsRef.current.length === 0) {
      setError("No hi ha documents ni mitjans nous per processar.");
    }
  }, [
    jobId,
    job,
    job?.status,
    contentKind,
    isAssigning,
    isRouting,
    startKind,
  ]);

  const isStarting =
    isProbing ||
    analyzeDocumentsMutation.isPending ||
    analyzeMediaMutation.isPending;
  const busy =
    isStarting ||
    isAssigning ||
    isRouting ||
    job?.status === "pending" ||
    job?.status === "running";
  const isActive = busy;

  const startAnalyze = useCallback(() => {
    if (
      isProbing ||
      analyzeDocumentsMutation.isPending ||
      analyzeMediaMutation.isPending ||
      isAssigning ||
      isRouting ||
      job?.status === "pending" ||
      job?.status === "running"
    ) {
      return;
    }

    setIsProbing(true);
    setAuthError(false);
    setError(null);
    completedKindsRef.current = [];
    setCompletedKinds([]);
    queueRef.current = [];

    hasPendingMedia()
      .then((mediaPending) => {
        // PDFs live on disk until analyze, so documents are always scanned.
        // Media rows exist after upload — only queue them when pending ones exist.
        queueRef.current = mediaPending ? ["media"] : [];
        startKind("documents");
      })
      .catch((err) => {
        if (isUnauthorizedError(err)) {
          setAuthError(true);
          setError(UNAUTHORIZED_MESSAGE);
          return;
        }
        setAuthError(false);
        setError(
          err instanceof ApiError
            ? err.message
            : "Error en comprovar la safata d'entrada",
        );
      })
      .finally(() => {
        setIsProbing(false);
      });
  }, [
    isProbing,
    analyzeDocumentsMutation.isPending,
    analyzeMediaMutation.isPending,
    isAssigning,
    isRouting,
    job?.status,
    startKind,
  ]);

  const cancel = useCallback(() => {
    queueRef.current = [];
    if (jobId) {
      cancelJob(jobId).then(setJob).catch(() => {});
    }
  }, [jobId]);

  return (
    <ClassificadorJobContext.Provider
      value={{
        jobId,
        job,
        error,
        authError,
        isStarting,
        isAssigning,
        isRouting,
        busy,
        isActive,
        contentKind,
        completedKinds,
        startAnalyze,
        cancel,
      }}
    >
      {children}
    </ClassificadorJobContext.Provider>
  );
}

export function useClassificadorJob(): ClassificadorJobContextValue {
  const ctx = useContext(ClassificadorJobContext);
  if (!ctx) {
    throw new Error(
      "useClassificadorJob must be used within ClassificadorJobProvider",
    );
  }
  return ctx;
}
