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
  startAnalyzeJob,
  ApiError,
  API_KEY_UNAUTHORIZED_MESSAGE,
  isUnauthorizedError,
} from "@/api/client";
import { useJobPolling } from "@/hooks/useJobPolling";
import type { JobOut } from "@/api/types";

interface ClassificadorJobContextValue {
  jobId: string | null;
  job: JobOut | null;
  error: string | null;
  authError: boolean;
  isStarting: boolean;
  isAssigning: boolean;
  busy: boolean;
  isActive: boolean;
  startAnalyze: () => void;
  cancel: () => void;
}

const ClassificadorJobContext =
  createContext<ClassificadorJobContextValue | null>(null);

export function ClassificadorJobProvider({ children }: { children: ReactNode }) {
  const [jobId, setJobId] = useState<string | null>(null);
  const [job, setJob] = useState<JobOut | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [authError, setAuthError] = useState(false);
  const [isAssigning, setIsAssigning] = useState(false);
  const assignedForJobRef = useRef<string | null>(null);

  const stopForUnauthorized = useCallback(() => {
    setAuthError(true);
    setError(API_KEY_UNAUTHORIZED_MESSAGE);
    setJobId(null);
    setJob(null);
    setIsAssigning(false);
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
    if (assignedForJobRef.current === jobId) return;
    assignedForJobRef.current = jobId;

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
        }
      })
      .finally(() => {
        if (!cancelled) setIsAssigning(false);
      });

    return () => {
      cancelled = true;
    };
  }, [jobId, job?.status, stopForUnauthorized]);

  const analyzeMutation = useMutation({
    mutationFn: () =>
      startAnalyzeJob({
        source: "inbox",
        require_review: true,
        run_assign: false,
        force: false,
        dry_run: false,
      }),
    onSuccess: (data) => {
      assignedForJobRef.current = null;
      setIsAssigning(false);
      setAuthError(false);
      setJobId(data.job_id);
      setJob(null);
      setError(null);
    },
    onError: (err) => {
      if (isUnauthorizedError(err)) {
        setAuthError(true);
        setError(API_KEY_UNAUTHORIZED_MESSAGE);
        return;
      }
      setAuthError(false);
      setError(
        err instanceof ApiError ? err.message : "Error en iniciar l'anàlisi",
      );
    },
  });

  const isStarting = analyzeMutation.isPending;
  const busy =
    isStarting ||
    isAssigning ||
    job?.status === "pending" ||
    job?.status === "running";
  const isActive = busy;

  const cancel = useCallback(() => {
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
        busy,
        isActive,
        startAnalyze: () => analyzeMutation.mutate(),
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
