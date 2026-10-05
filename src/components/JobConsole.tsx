import { useQuery } from "convex/react";
import { useEffect, useRef } from "react";
import type { Id } from "../convex/_generated/dataModel";
import { api } from "../convex/_generated/api";
import { Badge, Spinner } from "./ui";

export default function JobConsole({
  jobId,
  height = "h-72",
}: {
  jobId: Id<"jobs"> | null;
  height?: string;
}) {
  const job = useQuery(api.jobs.get, jobId ? { id: jobId } : "skip");
  const preRef = useRef<HTMLPreElement>(null);

  useEffect(() => {
    const el = preRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [job?.log]);

  const status = job?.status ?? (jobId ? "running" : undefined);

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs text-ink-400">
          {status === "running" ? (
            <>
              <Spinner className="h-3.5 w-3.5" />
              <span>{job?.step ?? "Starting…"}</span>
            </>
          ) : status === "done" ? (
            <Badge tone="signal">Complete</Badge>
          ) : status === "error" ? (
            <Badge tone="alert">Failed</Badge>
          ) : (
            <span className="text-ink-500">Idle</span>
          )}
        </div>
        {job?.kind ? (
          <span className="font-mono text-[10px] tracking-widest text-ink-600 uppercase">
            job:{job.kind}
          </span>
        ) : null}
      </div>
      <pre
        ref={preRef}
        aria-live="polite"
        className={`terminal overflow-auto p-4 ${height}`}
      >
        {job?.log || (jobId ? "Waiting for output…\n" : "Output will appear here.\n")}
      </pre>
    </div>
  );
}
