import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  ApiError,
  downloadAdminLogs,
  getAdminLogs,
  isForbiddenError,
  isUnauthorizedError,
  listLogSources,
} from "@/api/client";
import { PageHeader } from "@/components/PageHeader";
import { PanelEmptyActions, PanelLoading } from "@/components/PanelStatus";

const LEVEL_OPTIONS = [
  { value: "", label: "Tots els nivells" },
  { value: "debug", label: "Debug" },
  { value: "info", label: "Info" },
  { value: "warning", label: "Warning" },
  { value: "error", label: "Error" },
] as const;

const SINCE_OPTIONS = [
  { value: 900, label: "Últims 15 min" },
  { value: 3600, label: "Última hora" },
  { value: 21600, label: "Últimes 6 h" },
  { value: 86400, label: "Últimes 24 h" },
] as const;

function formatLogTs(ts: string): string {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return ts;
  return d.toLocaleString("ca-ES", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function levelClass(level: string | null | undefined): string {
  const raw = (level ?? "").toLowerCase();
  if (raw.includes("error") || raw.includes("fatal") || raw.includes("crit")) {
    return "admin-log-line--error";
  }
  if (raw.includes("warn")) return "admin-log-line--warn";
  if (raw.includes("debug")) return "admin-log-line--debug";
  return "";
}

export function AdminLogsPage() {
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const initialSource = searchParams.get("source") ?? "";
  const initialJobId = searchParams.get("job_id") ?? "";
  const isActive = location.pathname === "/admin/logs";

  const [source, setSource] = useState(initialSource);
  const [level, setLevel] = useState("");
  const [q, setQ] = useState("");
  const [qDraft, setQDraft] = useState("");
  const [jobId, setJobId] = useState(initialJobId);
  const [sinceSeconds, setSinceSeconds] = useState(3600);
  const [live, setLive] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const logEndRef = useRef<HTMLDivElement | null>(null);
  const stickToBottomRef = useRef(true);

  useEffect(() => {
    const nextSource = searchParams.get("source");
    const nextJobId = searchParams.get("job_id");
    if (nextSource) setSource(nextSource);
    if (nextJobId != null) setJobId(nextJobId);
  }, [searchParams]);

  const sourcesQuery = useQuery({
    queryKey: ["admin-log-sources"],
    queryFn: listLogSources,
    staleTime: 60_000,
    retry: (count, err) =>
      !isForbiddenError(err) && !isUnauthorizedError(err) && count < 1,
  });

  const sources = sourcesQuery.data?.sources ?? [];

  useEffect(() => {
    if (!source && sources.length > 0) {
      setSource(sources[0].id);
    }
  }, [source, sources]);

  const logsQuery = useQuery({
    queryKey: ["admin-logs", source, level, q, jobId, sinceSeconds],
    queryFn: () =>
      getAdminLogs({
        source,
        level: level || undefined,
        q: q || undefined,
        job_id: jobId || undefined,
        since_seconds: sinceSeconds,
        limit: 800,
      }),
    enabled: Boolean(source),
    retry: (count, err) =>
      !isForbiddenError(err) && !isUnauthorizedError(err) && count < 1,
    refetchInterval: (query) => {
      if (!live || !isActive) return false;
      if (
        isForbiddenError(query.state.error) ||
        isUnauthorizedError(query.state.error)
      ) {
        return false;
      }
      return 3000;
    },
  });

  const lines = logsQuery.data?.lines ?? [];

  useEffect(() => {
    if (!live || !stickToBottomRef.current) return;
    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [lines, live]);

  const errorMessage = useMemo(() => {
    const err = sourcesQuery.error ?? logsQuery.error;
    if (!err) return null;
    if (isForbiddenError(err)) {
      return "No tens permís per veure els logs.";
    }
    if (err instanceof ApiError && err.status === 404) {
      return "L'API de logs encara no està disponible al backend.";
    }
    return err instanceof Error ? err.message : "Error en carregar els logs";
  }, [sourcesQuery.error, logsQuery.error]);

  async function handleDownload() {
    if (!source) return;
    setDownloading(true);
    setDownloadError(null);
    try {
      const { blob, filename } = await downloadAdminLogs({
        source,
        level: level || undefined,
        q: q || undefined,
        job_id: jobId || undefined,
        since_seconds: sinceSeconds,
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setDownloadError(
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Error en descarregar",
      );
    } finally {
      setDownloading(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Logs"
        description="Consulta i descarrega els logs dels serveis (només administradors)."
      />

      {errorMessage && <div className="alert alert-error">{errorMessage}</div>}
      {downloadError && <div className="alert alert-error">{downloadError}</div>}

      <div className="card admin-ops-toolbar">
        <div className="field-grid admin-ops-filters">
          <div className="field">
            <label htmlFor="admin-log-source">Font</label>
            <select
              id="admin-log-source"
              value={source}
              onChange={(e) => setSource(e.target.value)}
              disabled={!sources.length}
            >
              {!sources.length && <option value="">Sense fonts</option>}
              {sources.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label htmlFor="admin-log-since">Període</label>
            <select
              id="admin-log-since"
              value={sinceSeconds}
              onChange={(e) => setSinceSeconds(Number(e.target.value))}
            >
              {SINCE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label htmlFor="admin-log-level">Nivell</label>
            <select
              id="admin-log-level"
              value={level}
              onChange={(e) => setLevel(e.target.value)}
            >
              {LEVEL_OPTIONS.map((opt) => (
                <option key={opt.value || "all"} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label htmlFor="admin-log-q">Cerca</label>
            <input
              id="admin-log-q"
              value={qDraft}
              onChange={(e) => setQDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") setQ(qDraft.trim());
              }}
              placeholder="Text al missatge…"
            />
          </div>

          <div className="field">
            <label htmlFor="admin-log-job">Job ID</label>
            <input
              id="admin-log-job"
              value={jobId}
              onChange={(e) => setJobId(e.target.value.trim())}
              placeholder="Opcional"
            />
          </div>
        </div>

        <div className="btn-row">
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => setQ(qDraft.trim())}
            disabled={!source}
          >
            Filtrar
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => logsQuery.refetch()}
            disabled={!source || logsQuery.isFetching}
          >
            Actualitzar
          </button>
          <button
            type="button"
            className="btn"
            onClick={handleDownload}
            disabled={!source || downloading}
          >
            {downloading ? "Descarregant…" : "Descarregar"}
          </button>
          <label className="admin-ops-live-toggle">
            <input
              type="checkbox"
              checked={live}
              onChange={(e) => setLive(e.target.checked)}
            />
            En viu
          </label>
        </div>
      </div>

      <div className="card admin-log-panel">
        <div className="admin-log-meta">
          {logsQuery.isFetching ? "Actualitzant…" : `${lines.length} línies`}
          {logsQuery.data?.truncated ? " · truncat" : ""}
        </div>
        <div
          className="admin-log-viewer"
          onScroll={(e) => {
            const el = e.currentTarget;
            const distance =
              el.scrollHeight - el.scrollTop - el.clientHeight;
            stickToBottomRef.current = distance < 48;
          }}
        >
          {!source && (
            <PanelEmptyActions title="Seleccioneu una font de logs." />
          )}
          {source && logsQuery.isLoading && !lines.length && (
            <PanelLoading label="Carregant logs…" />
          )}
          {source && !lines.length && !logsQuery.isLoading && !errorMessage && (
            <PanelEmptyActions title="No hi ha línies per a aquest filtre." />
          )}
          {lines.map((line, idx) => (
            <div
              key={`${line.ts}-${idx}`}
              className={`admin-log-line ${levelClass(line.level)}`}
            >
              <span className="admin-log-ts">{formatLogTs(line.ts)}</span>
              {line.level ? (
                <span className="admin-log-level">{line.level}</span>
              ) : null}
              <span className="admin-log-msg">{line.message}</span>
            </div>
          ))}
          <div ref={logEndRef} />
        </div>
      </div>
    </>
  );
}
