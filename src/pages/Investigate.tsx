import { useAction } from "convex/react";
import { useState, type FormEvent } from "react";
import DomainDetails from "../components/DomainDetails";
import { Badge, Button, Card, Field, Input, Notice, SectionTitle, Spinner } from "../components/ui";
import { api } from "../convex/_generated/api";
import type { DnsEntry } from "../lib/types";

type Result = { domain: string; entry: DnsEntry; log: string };

export default function Investigate() {
  const [domain, setDomain] = useState("");
  const [port, setPort] = useState("");
  const [whois, setWhois] = useState(true);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);

  const runInvestigate = useAction(api.investigate.run);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const res = await runInvestigate({
        domain: domain.trim(),
        port: port ? Number(port) : undefined,
        whois,
      });
      setResult(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <SectionTitle sub="HTTP headers, SSL, DNS, WHOIS, certificate history and Shodan — no credentials, nothing saved.">
        Investigate a domain
      </SectionTitle>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="p-5">
          <form onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Field label="Domain" hint="A server address, app domain, playlist host or sales page.">
                <Input
                  value={domain}
                  onChange={(e) => setDomain(e.target.value)}
                  placeholder="server.example.com"
                  required
                  disabled={busy}
                />
              </Field>
            </div>
            <Field label="HTTP port" hint="Only if not 80.">
              <Input
                value={port}
                onChange={(e) => setPort(e.target.value)}
                type="number"
                placeholder="8080"
                disabled={busy}
              />
            </Field>
            <label className="flex items-end gap-2 pb-2 text-sm text-ink-300">
              <input
                type="checkbox"
                checked={whois}
                onChange={(e) => setWhois(e.target.checked)}
                className="h-4 w-4 accent-signal-500"
                disabled={busy}
              />
              Run WHOIS (RDAP) lookup
            </label>
            <div className="flex items-center justify-end gap-3 sm:col-span-2">
              {error ? <span className="mr-auto text-xs text-alert-400">{error}</span> : null}
              <Button type="submit" disabled={busy}>
                {busy ? (
                  <>
                    <Spinner className="h-3.5 w-3.5" /> Investigating…
                  </>
                ) : (
                  "Investigate"
                )}
              </Button>
            </div>
          </form>

          <div className="mt-5 border-t border-ink-700 pt-4 text-xs leading-5 text-ink-500">
            Lookups run against free public sources: Google DNS-over-HTTPS, crt.sh, RDAP,
            ipinfo.io, HackerTarget, Shodan InternetDB. Optional Censys / urlscan keys add more.
          </div>
        </Card>

        <div>
          <div className="mb-2 flex items-center gap-2 text-xs text-ink-400">
            {busy ? (
              <>
                <Spinner className="h-3.5 w-3.5" />
                <span>Querying sources…</span>
              </>
            ) : result ? (
              <Badge tone="signal">{result.domain}</Badge>
            ) : (
              <span className="text-ink-500">Idle</span>
            )}
          </div>
          <pre className="terminal h-72 overflow-auto p-4">
            {result?.log || "Output will appear here.\n"}
          </pre>
        </div>
      </div>

      {result ? (
        <Card className="mt-5 overflow-hidden">
          <div className="px-5 py-4">
            <SectionTitle sub={`Infrastructure findings for ${result.domain}. Nothing was saved.`}>
              Result
            </SectionTitle>
          </div>
          <div className="border-t border-ink-700">
            <DomainDetails entry={result.entry} />
          </div>
        </Card>
      ) : null}

      {error && !result ? (
        <div className="mt-4">
          <Notice tone="alert">{error}</Notice>
        </div>
      ) : null}
    </div>
  );
}
