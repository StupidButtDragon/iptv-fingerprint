import { useMutation, useQuery } from "convex/react";
import { Link } from "react-router-dom";
import { ArrowRight, Plus, Trash2 } from "lucide-react";
import { Badge, Button, Card, Notice, SectionTitle, verdictTone } from "../components/ui";
import { formatDate, formatNum } from "../lib/format";
import { api } from "../convex/_generated/api";

export default function SavedScans() {
  const scans = useQuery(api.scans.list);
  const deleteScan = useMutation(api.scans.deleteScan);

  if (scans === undefined) {
    return (
      <div className="terminal p-6 text-ink-500">Loading saved scans…</div>
    );
  }

  if (scans.length === 0) {
    return (
      <div>
        <SectionTitle sub="Everything you've scanned shows up here.">Saved scans</SectionTitle>
        <Card className="p-8 text-center">
          <p className="text-sm text-ink-400">No fingerprints saved yet.</p>
          <Link to="/app" className="mt-4 inline-block">
            <Button>
              <Plus className="h-4 w-4" /> Identify your first provider
            </Button>
          </Link>
        </Card>
      </div>
    );
  }

  return (
    <div>
      <SectionTitle sub={`${scans.length} scan${scans.length === 1 ? "" : "s"} saved. Re-match or compare them any time.`}>
        Saved scans
      </SectionTitle>

      <div className="space-y-3">
        {scans.map((scan) => {
          const best = scan.matches[0];
          return (
            <Card key={scan._id} className="p-4 transition-colors hover:border-ink-600">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                <Link
                  to={`/app/scans/${encodeURIComponent(scan.name)}`}
                  className="group min-w-0 flex-1"
                >
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-semibold text-ink-100 group-hover:text-signal-400">
                      {scan.name}
                    </span>
                    {scan.aliases.map((alias) => (
                      <Badge key={alias} tone="muted" className="normal-case">
                        {alias}
                      </Badge>
                    ))}
                    <ArrowRight className="h-3.5 w-3.5 shrink-0 text-ink-600 transition-transform group-hover:translate-x-0.5 group-hover:text-signal-500" />
                  </div>
                  <div className="mt-1 text-xs text-ink-500">
                    {scan.primary_domain || "no domain"} · {formatDate(scan.collected_at)}
                  </div>
                </Link>

                <div className="flex items-center gap-4 font-mono text-[11px] text-ink-400">
                  <span>{formatNum(scan.stats.category_count)} cats</span>
                  <span>{formatNum(scan.stats.stream_count)} streams</span>
                  <span>{scan.stats.domain_count} dns</span>
                </div>

                {best ? (
                  <Badge tone={verdictTone(best.verdict)}>
                    {best.display_name} · {best.verdict}
                  </Badge>
                ) : (
                  <Badge tone="muted">no match</Badge>
                )}

                <Button
                  variant="ghost"
                  size="sm"
                  title={`Delete scan '${scan.name}'`}
                  onClick={() => {
                    if (window.confirm(`Delete the saved scan "${scan.name}"?`)) {
                      void deleteScan({ name: scan.name });
                    }
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </Card>
          );
        })}
      </div>

      <div className="mt-5">
        <Notice tone="muted">
          A scan that matched nothing may be a unique source — open it and use{" "}
          <strong className="text-ink-200">Save as known provider</strong> so future scans
          recognise it.
        </Notice>
      </div>
    </div>
  );
}
