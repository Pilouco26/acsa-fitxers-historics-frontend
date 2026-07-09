import { useEffect, useRef } from "react";
import { getJob } from "@/api/client";
import type { JobOut } from "@/api/types";

const TERMINAL = new Set(["completed", "failed", "cancelled"]);

export function useJobPolling(
  jobId: string | null,
  intervalMs = 2000,
  onUpdate?: (job: JobOut) => void,
  onError?: (err: unknown) => boolean | void,
) {
  const onUpdateRef = useRef(onUpdate);
  onUpdateRef.current = onUpdate;
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  useEffect(() => {
    if (!jobId) return;

    let active = true;

    const poll = async () => {
      try {
        const job = await getJob(jobId);
        if (!active) return;
        onUpdateRef.current?.(job);
        if (!TERMINAL.has(job.status)) {
          timer = window.setTimeout(poll, intervalMs);
        }
      } catch (err) {
        const shouldRetry = onErrorRef.current?.(err) !== false;
        if (active && shouldRetry) {
          timer = window.setTimeout(poll, intervalMs * 2);
        }
      }
    };

    let timer = window.setTimeout(poll, 0);

    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [jobId, intervalMs]);
}

export function isJobTerminal(status: string): boolean {
  return TERMINAL.has(status);
}
