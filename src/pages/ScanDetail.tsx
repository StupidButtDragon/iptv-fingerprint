import type { PaginationResult } from "convex/server";
import { useAction, useConvex, useMutation, useQuery } from "convex/react";
import {
  ArrowLeft,
  ChevronDown,
  Download,
  GitCompare,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import { useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import JobConsole from "../components/JobConsole";
import DomainDetails from "../components/DomainDetails";
import {
  Badge,
  Button,
  Card,
  Field,
  Input,
  Modal,
  Notice,
  SectionTitle,
  Spinner,
  Stat,
  verdictIcon,
  verdictTone,
} from "../components/ui";
import { api } from "../convex/_generated/api";
import type { Doc, Id } from "../convex/_generated/dataModel";
import { channelsToCsv, topCategories } from "../lib/csv";
import { formatDate, formatNum } from "../lib/format";
import type { ChannelRow } from "../lib/types";

type ModalKind = "alias" | "promote" | "enrich" | "merge" | "delete" | null;

export default function ScanDetail() {
  const { name: rawName } = useParams();
  const name = decodeURIComponent(rawName ?? "");
  const navigate = useNavigate();
  const convex = useConvex();

  const scan = useQuery(api.scans.get, { name });
  const allScans = useQuery(api.scans.list);

  const rematch = useMutation(api.scans.rematch);
  const addAliases = useMutation(api.scans.addAliases);
  const mergeScans = useMutation(api.scans.mergeScans);
  const deleteScan = useMutation(api.scans.deleteScan);
  const promote = useMutation(api.providers.promote);
  const createJob = useMutation(api.jobs.create);
  const runEnrich = useAction(api.enrich.run);

  const [modal, setModal] = useState<ModalKind>(null);
  const [note, setNote] = useState<{ tone: "signal" | "alert"; text: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  // modal form state
  const [aliasInput, setAliasInput] = useState("");
  const [providerId, setProviderId] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [extraDomains, setExtraDomains] = useState("");
  const [enrichDns, setEnrichDns] = useState("");
  const [enrichEpg, setEnrichEpg] = useState("");
  const [enrichPort, setEnrichPort] = useState("");
  const [enrichWhois, setEnrichWhois] = useState(false);
  const [enrichJobId, setEnrichJobId] = useState<Id<"jobs"> | null>(null);
  const [mergeSource, setMergeSource] = useState("");
  const [mergeDeleteSource, setMergeDeleteSource] = useState(false);

  const [exporting, setExporting] = useState(false);
  const [csvSummary, setCsvSummary] = useState<{ count: number; top: { name: string; count: number }[] } | null>(null);

  if (scan === undefined) {
    return <div className="terminal p-6 text-ink-500">Loading scan…</div>;
  }
  if (scan === null) {
    return (
      <Card className="p-8 text-center">
        <p className="text-sm text-ink-300">
          No saved scan called <span className="font-mono text-signal-400">{name}</span>.
        </p>
        <Link to="/app/scans" className="mt-4 inline-block">
          <Button variant="outline">Back to saved scans</Button>
        </Link>
      </Card>
    );
  }

  const best = scan.matches[0];

  async function runRematch() {
    setBusy("rematch");
    try {
      const matches = await rematch({ name });
      setNote({
        tone: "signal",
        text:
          matches.length > 0
            ? `Re-matched: ${matches.length} provider${matches.length === 1 ? "" : "s"} scored, best is ${matches[0].display_name} (${matches[0].verdict}).`
            : "Re-matched: no matches against your known providers.",
      });
    } catch (err) {
      setNote({ tone: "alert", text: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(null);
    }
  }

  async function submitAlias(e: FormEvent) {
    e.preventDefault();
    const aliases = aliasInput.split(",").map((a) => a.trim()).filter(Boolean);
    if (aliases.length === 0) return;
    setBusy("alias");
    try {
      await addAliases({ name, aliases, remove: false });
      setAliasInput("");
      setModal(null);
      setNote({ tone: "signal", text: `Added alias${aliases.length > 1 ? "es" : ""}: ${aliases.join(", ")}.` });
    } catch (err) {
      setNote({ tone: "alert", text: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(null);
    }
  }

  async function submitPromote(e: FormEvent) {
    e.preventDefault();
    setBusy("promote");
    try {
      const res = await promote({
        scan_name: name,
        provider_id: providerId,
        display_name: displayName,
        extra_domains: extraDomains,
      });
      setModal(null);
      setNote({
        tone: "signal",
        text: `Promoted “${displayName}” as “${res.provider_id}” (${res.replaced ? "replaced existing profile" : "new profile"}). All saved scans were re-scored.`,
      });
    } catch (err) {
      setNote({ tone: "alert", text: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(null);
    }
  }

  async function submitEnrich(e: FormEvent) {
    e.preventDefault();
    setBusy("enrich");
    try {
      const jobId = await createJob({ kind: "enrich" });
      setEnrichJobId(jobId);
      await runEnrich({
        job_id: jobId,
        name,
        dns: enrichDns,
        epg: enrichEpg || undefined,
        port: enrichPort ? Number(enrichPort) : undefined,
        whois: enrichWhois,
      });
      setNote({ tone: "signal", text: "Enrichment complete — the scan now includes the new data." });
    } catch (err) {
      setNote({ tone: "alert", text: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(null);
    }
  }

  async function submitMerge(e: FormEvent) {
    e.preventDefault();
    if (!mergeSource) return;
    setBusy("merge");
    try {
      const res = await mergeScans({ source: mergeSource, into: name, delete_source: mergeDeleteSource });
      setModal(null);
      setNote({
        tone: "signal",
        text: `Merged “${mergeSource}” into “${name}” — ${res.new_domains.length} new domain(s), ${res.new_epgs.length} new EPG URL(s).`,
      });
    } catch (err) {
      setNote({ tone: "alert", text: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(null);
    }
  }

  async function submitDelete() {
    setBusy("delete");
    try {
      await deleteScan({ name });
      navigate("/app/scans");
    } catch (err) {
      setNote({ tone: "alert", text: err instanceof Error ? err.message : String(err) });
      setBusy(null);
    }
  }

  async function exportCsv() {
    if (!scan) return;
    setExporting(true);
    try {
      const rows: ChannelRow[] = [];
      let cursor: string | null = null;
      let done = false;
      while (!done) {
        const page: PaginationResult<Doc<"channels">> = await convex.query(api.channels.page, {
          scan_id: scan._id,
          paginationOpts: { numItems: 50, cursor },
        });
        for (const chunk of page.page) rows.push(...chunk.rows);
        cursor = page.continueCursor;
        done = page.isDone;
      }
      if (rows.length === 0) {
        setNote({ tone: "alert", text: "No stored channels for this scan — run a fresh scan to capture the lineup." });
        return;
      }
      const csv = channelsToCsv(rows);
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      const href = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = href;
      a.download = `${name.replace(/[^\w.-]+/g, "_")}_channels.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(href);
      setCsvSummary({ count: rows.length, top: topCategories(rows, 10) });
    } catch (err) {
      setNote({ tone: "alert", text: err instanceof Error ? err.message : String(err) });
    } finally {
      setExporting(false);
    }
  }

  const otherScans = (allScans ?? []).map((s) => s.name).filter((n) => n !== name);

  return (
    <div>
      <Link
        to="/app/scans"
        className="mb-4 inline-flex items-center gap-1.5 text-xs text-ink-500 transition-colors hover:text-signal-400"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Saved scans
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-xl font-bold tracking-tight text-ink-100">{scan.name}</h1>
            {scan.aliases.map((alias) => (
              <Badge key={alias} tone="muted">{alias}</Badge>
            ))}
          </div>
          <p className="mt-1 font-mono text-xs text-ink-500">
            {scan.primary_domain} · scanned {formatDate(scan.collected_at)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={runRematch} disabled={busy !== null}>
            {busy === "rematch" ? <Spinner className="h-3.5 w-3.5" /> : <Search className="h-3.5 w-3.5" />}
            Re-match
          </Button>
          <Button variant="outline" size="sm" onClick={() => setModal("alias")}>
            <Plus className="h-3.5 w-3.5" /> Alias
          </Button>
          <Button variant="outline" size="sm" onClick={() => setModal("enrich")}>
            <Plus className="h-3.5 w-3.5" /> Domains / EPG
          </Button>
          <Button variant="outline" size="sm" onClick={() => setModal("promote")}>
            <GitCompare className="h-3.5 w-3.5" /> Save as provider
          </Button>
          {otherScans.length > 0 ? (
            <Button variant="outline" size="sm" onClick={() => setModal("merge")}>
              <GitCompare className="h-3.5 w-3.5" /> Merge
            </Button>
          ) : null}
          <Button variant="outline" size="sm" onClick={exportCsv} disabled={exporting}>
            {exporting ? <Spinner className="h-3.5 w-3.5" /> : <Download className="h-3.5 w-3.5" />}
            CSV
          </Button>
          <Button variant="danger" size="sm" onClick={() => setModal("delete")}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {note ? (
        <div className="mt-4">
          <Notice tone={note.tone}>{note.text}</Notice>
        </div>
      ) : null}

      {/* Verdict */}
      <Card className="mt-5 p-5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold tracking-wide text-ink-200">
            Known provider matching
          </h2>
          <span className="text-[11px] text-ink-500">
            {scan.matches.length} scored
          </span>
        </div>

        {best ? (
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Badge tone={verdictTone(best.verdict)}>
              {verdictIcon(best.verdict)} {best.verdict}
            </Badge>
            <span className="text-lg font-semibold text-ink-100">{best.display_name}</span>
            <span className="font-mono text-sm text-ink-400">score {best.score}</span>
          </div>
        ) : (
          <div className="mt-4">
            <Notice tone="muted">
              <strong className="text-ink-200">No matches found.</strong> This appears to be an
              unknown / unique source. Add its domains under <em>Domains / EPG</em>, then{" "}
              <em>Save as provider</em> so future scans identify it instantly.
            </Notice>
          </div>
        )}

        {scan.matches.length > 0 ? (
          <div className="mt-4 space-y-2">
            {scan.matches.map((m) => (
              <details
                key={m.provider_id}
                className="group rounded-lg border border-ink-700 bg-ink-950/50 open:border-ink-600"
              >
                <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-2.5 text-sm [&::-webkit-details-marker]:hidden">
                  <ChevronDown className="h-3.5 w-3.5 shrink-0 text-ink-500 transition-transform group-open:rotate-180" />
                  <span className="font-medium text-ink-100">{m.display_name}</span>
                  <Badge tone={verdictTone(m.verdict)}>{m.verdict}</Badge>
                  <span className="ml-auto font-mono text-xs text-ink-400">{m.score}</span>
                </summary>
                <ul className="space-y-1 border-t border-ink-700/70 px-4 py-3 text-xs text-ink-300">
                  {m.signals.map((signal) => (
                    <li key={signal} className="flex gap-2">
                      <span className="text-signal-600">›</span>
                      {signal}
                    </li>
                  ))}
                </ul>
              </details>
            ))}
          </div>
        ) : null}
      </Card>

      {/* Stats */}
      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Categories" value={formatNum(scan.stats.category_count)} />
        <Stat label="Live streams" value={formatNum(scan.stats.stream_count)} />
        <Stat label="VOD items" value={formatNum(scan.stats.vod_count)} />
        <Stat label="Series cats" value={formatNum(scan.stats.series_count)} />
        <Stat label="Domains" value={scan.stats.domain_count} />
        <Stat label="Logo hosts" value={scan.stats.logo_domain_count} />
        <Stat label="EPG URLs" value={scan.stats.epg_count} />
        <Stat label="API" value={scan.xtream.api_type ?? "unknown"} />
      </div>

      {/* Fingerprint */}
      <Card className="mt-5 p-5">
        <SectionTitle sub="The content evidence — IDs a reseller cannot change.">Fingerprint</SectionTitle>
        <div className="grid gap-5 text-sm sm:grid-cols-2">
          <div className="space-y-2 text-ink-300">
            <div>
              <span className="text-ink-500">Naming style: </span>
              <span className="font-mono">
                {scan.xtream.naming_patterns.separator_char ?? "no separator"} style
              </span>
              {scan.xtream.naming_patterns.uses_unicode_stars ? " · star decorators" : ""}
              {scan.xtream.naming_patterns.uses_emoji ? " · emoji" : ""}
            </div>
            <div>
              <span className="text-ink-500">Server software: </span>
              <span className="font-mono">{scan.server_software ?? "unknown"}</span>
              {scan.cloudflare ? <Badge tone="info" className="ml-2">Cloudflare</Badge> : null}
            </div>
            <div>
              <span className="text-ink-500">Timezone: </span>
              <span className="font-mono">{String(scan.xtream.server_info.timezone ?? "—")}</span>
            </div>
            <div>
              <span className="text-ink-500">Stream IDs: </span>
              <span className="font-mono">{scan.xtream.stream_id_set.split(",").filter(Boolean).length} captured</span>
            </div>
          </div>
          <div>
            <div className="mb-1.5 text-[10px] font-semibold tracking-widest text-ink-500 uppercase">
              Category sample (in order)
            </div>
            <div className="flex flex-wrap gap-1.5">
              {scan.xtream.categories.slice(0, 9).map((c) => (
                <span
                  key={c.category_id + c.category_name}
                  className="rounded border border-ink-700 bg-ink-950 px-2 py-0.5 font-mono text-[11px] text-ink-300"
                >
                  {c.category_name}
                </span>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-5 grid gap-5 text-sm sm:grid-cols-2">
          <div>
            <div className="mb-1.5 text-[10px] font-semibold tracking-widest text-ink-500 uppercase">
              Logo hosts
            </div>
            <div className="flex flex-wrap gap-1.5">
              {scan.xtream.logo_domains.length > 0 ? (
                scan.xtream.logo_domains.slice(0, 10).map((d) => (
                  <span key={d} className="rounded border border-ink-700 bg-ink-950 px-2 py-0.5 font-mono text-[11px] text-ink-300">
                    {d}
                  </span>
                ))
              ) : (
                <span className="text-xs text-ink-500">none found</span>
              )}
            </div>
          </div>
          <div>
            <div className="mb-1.5 text-[10px] font-semibold tracking-widest text-ink-500 uppercase">
              EPG URLs
            </div>
            <div className="space-y-1">
              {scan.xtream.epg_urls.length > 0 ? (
                scan.xtream.epg_urls.map((u) => (
                  <div key={u} className="break-all font-mono text-[11px] text-ink-300">{u}</div>
                ))
              ) : (
                <span className="text-xs text-ink-500">none found</span>
              )}
            </div>
          </div>
        </div>
      </Card>

      {/* Domains / infrastructure */}
      <Card className="mt-5 p-5">
        <SectionTitle sub="Infrastructure investigated for every domain on this provider.">
          Domains & infrastructure
        </SectionTitle>
        <div className="overflow-hidden rounded-lg border border-ink-700">
          {Object.entries(scan.dns_entries).map(([domain, entry], i) => {
            const ip = entry.dns.a_records[0] ?? "?";
            return (
              <details
                key={domain}
                className={`group ${i > 0 ? "border-t border-ink-700" : ""}`}
              >
                <summary className="flex cursor-pointer list-none items-center gap-3 bg-ink-950/50 px-4 py-3 text-sm [&::-webkit-details-marker]:hidden">
                  <ChevronDown className="h-3.5 w-3.5 shrink-0 text-ink-500 transition-transform group-open:rotate-180" />
                  <span className="min-w-0 flex-1 truncate font-mono text-xs text-ink-100">{domain}</span>
                  <span className="hidden font-mono text-xs text-ink-400 sm:block">{ip}</span>
                  <span className="hidden w-28 truncate text-xs text-ink-400 md:block">
                    {entry.headers.server_software ?? "unknown"}
                  </span>
                  <Badge tone={entry.headers.cloudflare ? "info" : "muted"}>
                    {entry.headers.cloudflare ? "CF" : "direct"}
                  </Badge>
                  {domain === scan.primary_domain ? <Badge tone="signal">primary</Badge> : null}
                </summary>
                <DomainDetails entry={entry} />
              </details>
            );
          })}
        </div>
      </Card>

      {/* CSV summary */}
      {csvSummary ? (
        <Card className="mt-5 p-5">
          <SectionTitle sub={`${formatNum(csvSummary.count)} channels downloaded.`}>
            Export ready
          </SectionTitle>
          <div className="grid gap-1.5 text-sm sm:grid-cols-2">
            {csvSummary.top.map((t) => (
              <div key={t.name} className="flex justify-between gap-3 rounded bg-ink-950/60 px-3 py-1.5">
                <span className="truncate text-ink-300">{t.name}</span>
                <span className="font-mono text-ink-500">{t.count}</span>
              </div>
            ))}
          </div>
        </Card>
      ) : null}

      {/* Alias modal */}
      <Modal open={modal === "alias"} title="Add aliases" onClose={() => setModal(null)}>
        <form onSubmit={submitAlias} className="space-y-4">
          <Field label="Aliases" hint="Other names this service is sold under, comma-separated.">
            <Input value={aliasInput} onChange={(e) => setAliasInput(e.target.value)} placeholder="Brand B, Brand C" required />
          </Field>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setModal(null)}>Cancel</Button>
            <Button type="submit" disabled={busy === "alias"}>
              {busy === "alias" ? <Spinner className="h-3.5 w-3.5" /> : null} Add
            </Button>
          </div>
        </form>
      </Modal>

      {/* Promote modal */}
      <Modal open={modal === "promote"} title="Save as known provider" onClose={() => setModal(null)}>
        <form onSubmit={submitPromote} className="space-y-4">
          <Notice tone="muted">
            If this scan already matched something as MATCH/LIKELY it's a rebrand — use Merge or
            Aliases instead, otherwise results get split between two profiles.
          </Notice>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Provider ID" hint="Short, unique, e.g. mystery-tv">
              <Input value={providerId} onChange={(e) => setProviderId(e.target.value)} placeholder="mystery-tv" required />
            </Field>
            <Field label="Display name">
              <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Mystery TV" required />
            </Field>
          </div>
          <Field label="Extra domains (optional)" hint="More known domains, comma-separated.">
            <Input value={extraDomains} onChange={(e) => setExtraDomains(e.target.value)} placeholder="dns1.example.com, dns2.example.com" />
          </Field>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setModal(null)}>Cancel</Button>
            <Button type="submit" disabled={busy === "promote"}>
              {busy === "promote" ? <Spinner className="h-3.5 w-3.5" /> : null} Promote
            </Button>
          </div>
        </form>
      </Modal>

      {/* Enrich modal */}
      <Modal open={modal === "enrich"} title="Add domains / EPG" onClose={() => setModal(null)}>
        {enrichJobId ? (
          <div className="space-y-4">
            <JobConsole jobId={enrichJobId} height="h-64" />
            <div className="flex justify-end">
              <Button variant="outline" onClick={() => { setModal(null); setEnrichJobId(null); }}>
                Close
              </Button>
            </div>
          </div>
        ) : (
          <form onSubmit={submitEnrich} className="space-y-4">
            <Field label="Extra domains" hint="Backup URLs or portal domains, comma-separated. Each is fully investigated.">
              <Input value={enrichDns} onChange={(e) => setEnrichDns(e.target.value)} placeholder="backup1.com, http://backup2.com:8080" required />
            </Field>
            <Field label="EPG URLs (optional)">
              <Input value={enrichEpg} onChange={(e) => setEnrichEpg(e.target.value)} placeholder="http://epg.example.com/guide.xml" />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="HTTP port" hint="Only if not 80.">
                <Input value={enrichPort} onChange={(e) => setEnrichPort(e.target.value)} type="number" placeholder="8080" />
              </Field>
              <label className="flex items-end gap-2 pb-2 text-sm text-ink-300">
                <input
                  type="checkbox"
                  checked={enrichWhois}
                  onChange={(e) => setEnrichWhois(e.target.checked)}
                  className="h-4 w-4 accent-signal-500"
                />
                Also run WHOIS on new domains
              </label>
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setModal(null)}>Cancel</Button>
              <Button type="submit" disabled={busy === "enrich"}>
                {busy === "enrich" ? <Spinner className="h-3.5 w-3.5" /> : null} Investigate
              </Button>
            </div>
          </form>
        )}
      </Modal>

      {/* Merge modal */}
      <Modal open={modal === "merge"} title="Merge scans" onClose={() => setModal(null)}>
        <form onSubmit={submitMerge} className="space-y-4">
          <Notice tone="muted">
            Folds another scan into “{scan.name}”: its domains, EPG URLs and logo hosts are added,
            and its name becomes an alias of this scan.
          </Notice>
          <Field label="Merge from">
            <select
              value={mergeSource}
              onChange={(e) => setMergeSource(e.target.value)}
              className="w-full appearance-none rounded-lg border border-ink-600 bg-ink-950 px-3 py-2 text-sm text-ink-100 outline-none focus:border-signal-600"
              required
            >
              <option value="">Choose a scan…</option>
              {otherScans.map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </Field>
          <label className="flex items-center gap-2 text-sm text-ink-300">
            <input
              type="checkbox"
              checked={mergeDeleteSource}
              onChange={(e) => setMergeDeleteSource(e.target.checked)}
              className="h-4 w-4 accent-signal-500"
            />
            Delete the source scan afterwards
          </label>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setModal(null)}>Cancel</Button>
            <Button type="submit" disabled={busy === "merge" || !mergeSource}>
              {busy === "merge" ? <Spinner className="h-3.5 w-3.5" /> : null} Merge
            </Button>
          </div>
        </form>
      </Modal>

      {/* Delete modal */}
      <Modal open={modal === "delete"} title="Delete scan" onClose={() => setModal(null)}>
        <div className="space-y-4">
          <Notice tone="alert">
            Permanently remove “{scan.name}” and its stored channel list? This cannot be undone.
          </Notice>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setModal(null)}>Cancel</Button>
            <Button variant="danger" onClick={submitDelete} disabled={busy === "delete"}>
              {busy === "delete" ? <Spinner className="h-3.5 w-3.5" /> : null} Delete
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
