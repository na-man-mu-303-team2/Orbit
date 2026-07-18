import type { OoxmlSyncState } from "@orbit/shared";
import { jobSchema, type Job } from "../../../../../../../packages/shared/src/jobs/job.schema";
import { useEffect, useState } from "react";

import { ooxmlSyncJobEventName } from "../api/deckPersistenceApi";
import { getOoxmlSyncState, retryOoxmlSync } from "../api/editorJobApi";

export function useOoxmlSyncJob(projectId: string) {
  const [job, setJob] = useState<Job | null>(null);
  const [state, setState] = useState<OoxmlSyncState | null>(null);

  useEffect(() => {
    let isCancelled = false;
    void getOoxmlSyncState(projectId)
      .then((nextState) => {
        if (!isCancelled) {
          setState(nextState);
          setJob(nextState.job ?? null);
        }
      })
      .catch(() => undefined);
    return () => {
      isCancelled = true;
    };
  }, [projectId]);

  useEffect(() => {
    function handleOoxmlSyncJob(event: Event) {
      const nextJob = (event as CustomEvent<Job>).detail;
      setJob(jobSchema.parse(nextJob));
      setState((current) =>
        current
          ? {
              ...current,
              status:
                nextJob.status === "failed"
                  ? "failed"
                  : nextJob.status === "succeeded"
                    ? "synced"
                    : "pending",
              syncedDeckVersion:
                nextJob.status === "succeeded"
                  ? current.deckVersion
                  : current.syncedDeckVersion,
              retryable: nextJob.status === "failed",
              job: nextJob
            }
          : current
      );
    }

    window.addEventListener(ooxmlSyncJobEventName, handleOoxmlSyncJob);
    return () =>
      window.removeEventListener(ooxmlSyncJobEventName, handleOoxmlSyncJob);
  }, []);

  useEffect(() => {
    if (!job || ["succeeded", "failed"].includes(job.status)) return;

    let isCancelled = false;
    const intervalId = window.setInterval(() => {
      void fetch(`/api/jobs/${encodeURIComponent(job.jobId)}`)
        .then(async (response) => {
          if (!response.ok) return null;
          return jobSchema.parse(await response.json());
        })
        .then((nextJob) => {
          if (!isCancelled && nextJob) {
            setJob(nextJob);
            if (["succeeded", "failed"].includes(nextJob.status)) {
              void getOoxmlSyncState(projectId)
                .then((nextState) => {
                  if (!isCancelled) setState(nextState);
                })
                .catch(() => undefined);
            }
          }
        })
        .catch(() => undefined);
    }, 1800);

    return () => {
      isCancelled = true;
      window.clearInterval(intervalId);
    };
  }, [job, projectId]);

  async function retry() {
    const nextState = await retryOoxmlSync(projectId);
    setState(nextState);
    setJob(nextState.job ?? null);
  }

  return { job, retry, state };
}
