type JobProgressDisplayProps = {
  progress: number;
  message: string;
};

export function JobProgressDisplay({ progress, message }: JobProgressDisplayProps) {
  const pct = Math.round(progress);

  return (
    <div className="rehearsal-job-progress">
      <div
        className="rehearsal-job-progress-bar"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
      >
        <div
          className="rehearsal-job-progress-fill"
          style={{ width: `${progress}%` }}
        />
      </div>
      <p className="rehearsal-job-progress-pct">{pct}%</p>
      <p className="rehearsal-job-progress-label">{message}</p>
    </div>
  );
}
