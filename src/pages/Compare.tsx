import { useQuery } from "convex/react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Badge, Button, Card, Notice, SectionTitle, compareTone } from "../components/ui";
import { api } from "../convex/_generated/api";
import type { MatchEntry } from "../lib/compare";

const LABELS: Record<string, string> = {
  stream_ids: "Stream IDs",
  category_ids: "Category IDs",
  category_names: "Category names",
  category_ordering: "Category ordering",
  naming_patterns: "Naming style",
  logo_domains: "Logo hosts",
  epg_urls: "EPG URLs",
  vod_library: "VOD library",
  infrastructure: "Infrastructure",
};

function isOverlap(m: MatchEntry): m is Extract<MatchEntry, { overlap_pct: number }> {
  return "overlap_pct" in m;
}

function SignalRow({ name, match }: { name: string; match: MatchEntry }) {
  const label = LABELS[name] ?? name;

  if ("details" in match) {
    return (
      <div className="px-4 py-3">
        <div className="text-sm font-medium text-ink-200">{label}</div>
        <ul className="mt-1.5 space-y-1 text-xs text-ink-400">
          {match.details.map((d) => (
            <li key={d} className="flex gap-2">
              <span className="text-signal-600">›</span>
              {d}
            </li>
          ))}
        </ul>
      </div>
    );
  }

  const pct = isOverlap(match) ? match.overlap_pct : match.similarity;
  const detail = isOverlap(match)
    ? `${match.overlap}/${match.total} shared`
    : `${pct.toFixed(0)}% match`;
  const samples = isOverlap(match) ? match.matched_samples : [];

  return (
    <div className="px-4 py-3">
      <div className="flex items-center justify-between gap-4">
        <span className="text-sm font-medium text-ink-200">{label}</span>
        <span className="font-mono text-xs text-ink-400">
          {pct.toFixed(1)}% · {detail}
        </span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-ink-800">
        <div
          className={`h-full rounded-full ${pct >= 60 ? "bg-signal-500" : pct >= 25 ? "bg-info-500" : "bg-amber-500"}`}
          style={{ width: `${Math.max(pct, pct > 0 ? 2 : 0)}%` }}
        />
      </div>
      {samples.length > 0 ? (
        <div className="mt-1.5 truncate font-mono text-[10.5px] text-ink-500">
          {samples.slice(0, 6).join(", ")}
          {samples.length > 6 ? " …" : ""}
        </div>
      ) : null}
    </div>
  );
}

export default function Compare() {
  const scans = useQuery(api.scans.list);
  const [a, setA] = useState("");
  const [b, setB] = useState("");

  useEffect(() => {
    if (scans && scans.length > 0 && !a) {
      setA(scans[0].name);
      setB(scans[1]?.name ?? scans[0].name);
    }
  }, [scans, a]);

  const ready = a && b && a !== b;
  const report = useQuery(api.scans.compareScans, ready ? { a, b } : "skip");

  if (!scans) return <div className="terminal p-6 text-ink-500">Loading…</div>;

  if (scans.length < 2) {
    return (
      <div>
        <SectionTitle sub="Side-by-side overlap of two saved scans, with a weighted confidence verdict.">
          Compare two scans
        </SectionTitle>
        <Card className="p-8 text-center">
          <p className="text-sm text-ink-400">
            You need at least two saved scans to compare. Scan another provider first.
          </p>
          <Link to="/app" className="mt-4 inline-block">
            <Button>Identify a provider</Button>
          </Link>
        </Card>
      </div>
    );
  }

  return (
    <div>
      <SectionTitle sub="Side-by-side overlap of two saved scans, with a weighted confidence verdict.">
        Compare two scans
      </SectionTitle>

      <div className="grid gap-3 sm:grid-cols-2">
        {[{ value: a, set: setA }, { value: b, set: setB }].map((sel, i) => (
          <Card key={i} className="p-3">
            <div className="mb-1.5 text-[10px] font-semibold tracking-widest text-ink-500 uppercase">
              {i === 0 ? "Scan A" : "Scan B"}
            </div>
            <select
              value={sel.value}
              onChange={(e) => sel.set(e.target.value)}
              className="w-full appearance-none rounded-lg border border-ink-600 bg-ink-950 px-3 py-2 text-sm text-ink-100 outline-none focus:border-signal-600"
            >
              {scans.map((s) => (
                <option key={s.name} value={s.name}>
                  {s.name}
                </option>
              ))}
            </select>
          </Card>
        ))}
      </div>

      {ready ? (
        report ? (
          <div className="mt-6 space-y-5">
            <Card className="overflow-hidden">
              <div className="border-b border-ink-700 bg-ink-950/60 px-5 py-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5 text-sm text-ink-300">
                    <span className="font-semibold text-ink-100">{report.provider_a}</span>
                    <span className="text-ink-600">vs</span>
                    <span className="font-semibold text-ink-100">{report.provider_b}</span>
                  </div>
                  <Badge tone={compareTone(report.verdict)}>
                    {report.confidence}% confidence
                  </Badge>
                </div>
                <p
                  className={`mt-2 text-base font-semibold ${
                    compareTone(report.verdict) === "signal"
                      ? "text-signal-400"
                      : compareTone(report.verdict) === "info"
                        ? "text-info-400"
                        : compareTone(report.verdict) === "amber"
                          ? "text-amber-400"
                          : "text-alert-400"
                  }`}
                >
                  {report.verdict}
                </p>
              </div>

              <div className="divide-y divide-ink-700/70">
                {Object.entries(report.matches).map(([key, match]) => (
                  <SignalRow key={key} name={key} match={match} />
                ))}
              </div>
            </Card>

            <Notice tone="muted">
              Confidence weights: stream IDs 30%, category IDs 15%, names 10%, ordering 10%,
              logo hosts 10%, EPG 10%, naming 5%, VOD 5%, infrastructure 5%.
            </Notice>
          </div>
        ) : (
          <div className="mt-6 terminal p-6 text-ink-500">Computing comparison…</div>
        )
      ) : (
        <div className="mt-6">
          <Notice tone="amber">Pick two different scans to compare.</Notice>
        </div>
      )}
    </div>
  );
}
