import { useAction, useMutation, useQuery } from "convex/react";
import { useEffect, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import JobConsole from "../components/JobConsole";
import { Button, Card, Field, Input, Notice, SectionTitle, Spinner } from "../components/ui";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";

export default function Identify() {
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [user, setUser] = useState("");
  const [password, setPassword] = useState("");
  const [dns, setDns] = useState("");
  const [epg, setEpg] = useState("");
  const [streamTest, setStreamTest] = useState(false);

  const [jobId, setJobId] = useState<Id<"jobs"> | null>(null);
  const [busy, setBusy] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);

  const navigate = useNavigate();
  const createJob = useMutation(api.jobs.create);
  const startCollect = useAction(api.collect.start);
  const existing = useQuery(api.scans.get, name.trim() ? { name: name.trim() } : "skip");
  const job = useQuery(api.jobs.get, jobId ? { id: jobId } : "skip");

  useEffect(() => {
    if (job?.status === "done" && job.result_scan) {
      navigate(`/app/scans/${encodeURIComponent(job.result_scan)}`);
    }
  }, [job?.status, job?.result_scan, navigate]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setStartError(null);
    try {
      const id = await createJob({ kind: "collect" });
      setJobId(id);
      await startCollect({
        job_id: id,
        name: name.trim(),
        url: url.trim(),
        user: user.trim(),
        password,
        dns: dns.trim() || undefined,
        epg: epg.trim() || undefined,
        stream_test: streamTest,
      });
    } catch (err) {
      setStartError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  const running = busy || job?.status === "running";

  return (
    <div>
      <SectionTitle sub="Log in with a provider's Xtream credentials, capture its fingerprint, and match it against every known provider.">
        Identify a provider
      </SectionTitle>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="p-5">
          <form onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Field label="Scan name" hint="Any name you'll recognise later. Reusing a name replaces that scan.">
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. mystery"
                  required
                  disabled={running}
                />
              </Field>
            </div>
            {existing ? (
              <div className="sm:col-span-2">
                <Notice tone="amber">
                  A scan named “{existing.name}” already exists — running will replace it.
                </Notice>
              </div>
            ) : null}

            <div className="sm:col-span-2">
              <Field label="Server URL" hint="Including http:// and the port, e.g. http://server.com:8080">
                <Input
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="http://server.com:8080"
                  type="url"
                  required
                  disabled={running}
                />
              </Field>
            </div>

            <Field label="Username">
              <Input
                value={user}
                onChange={(e) => setUser(e.target.value)}
                required
                autoComplete="off"
                disabled={running}
              />
            </Field>
            <Field label="Password">
              <Input
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                type="password"
                required
                autoComplete="new-password"
                disabled={running}
              />
            </Field>

            <div className="sm:col-span-2">
              <Field
                label="Extra domains (optional)"
                hint="Backup URLs, MAG portal, etc. — comma-separated. Each one is investigated too."
              >
                <Input
                  value={dns}
                  onChange={(e) => setDns(e.target.value)}
                  placeholder="backup1.com, backup2.com"
                  disabled={running}
                />
              </Field>
            </div>

            <div className="sm:col-span-2">
              <Field label="EPG URLs (optional)" hint="XMLTV links the provider gave you, comma-separated.">
                <Input
                  value={epg}
                  onChange={(e) => setEpg(e.target.value)}
                  placeholder="http://epg.example.com/guide.xml"
                  disabled={running}
                />
              </Field>
            </div>

            <label className="flex items-center gap-2 text-sm text-ink-300">
              <input
                type="checkbox"
                checked={streamTest}
                onChange={(e) => setStreamTest(e.target.checked)}
                className="h-4 w-4 accent-signal-500"
                disabled={running}
              />
              Also analyze a sample stream
            </label>

            <div className="flex items-center justify-end gap-3 sm:col-span-2">
              {startError ? (
                <span className="mr-auto text-xs text-alert-400">{startError}</span>
              ) : null}
              <Button type="submit" disabled={running}>
                {running ? (
                  <>
                    <Spinner className="h-3.5 w-3.5" /> Scanning…
                  </>
                ) : (
                  "Run"
                )}
              </Button>
            </div>
          </form>

          <div className="mt-5 border-t border-ink-700 pt-4 text-xs leading-5 text-ink-500">
            Your provider logins are sent only to the provider itself — the scan runs on this
            deployment's functions and never shares them with anyone else.
          </div>
        </Card>

        <div>
          <JobConsole jobId={jobId} height="h-[28rem]" />
          {job?.status === "error" ? (
            <div className="mt-3">
              <Notice tone="alert">
                The scan failed: {job.error ?? "unknown error"} — check the log above for
                details.
              </Notice>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
