import { jobSchema, type Job } from "../../../../../../../packages/shared/src/jobs/job.schema";
import { useEffect, useState } from "react";

import { ooxmlSyncJobEventName } from "../api/deckPersistenceApi";

export function useOoxmlSyncJob() {
  const [job, setJob] = useState<Job | null>(null);

  useEffect(() => {
    function handleOoxmlSyncJob(event: Event) {
      const nextJob = (event as CustomEvent<Job>).detail;
      setJob(jobSchema.parse(nextJob));
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
          if (!isCancelled && nextJob) setJob(nextJob);
        })
        .catch(() => undefined);
    }, 1800);

    return () => {
      isCancelled = true;
      window.clearInterval(intervalId);
    };
  }, [job]);

  return job;
}
