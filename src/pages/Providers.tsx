import { useQuery } from "convex/react";
import { ChevronDown } from "lucide-react";
import { Badge, Card, SectionTitle } from "../components/ui";
import { formatDate } from "../lib/format";
import type { ProviderProfile } from "../lib/types";
import { api } from "../convex/_generated/api";

function ProviderCard({
  providerId,
  profile,
  source,
  createdAt,
}: {
  providerId: string;
  profile: ProviderProfile;
  source?: string;
  createdAt?: number;
}) {
  const naming = profile.naming_pattern;
  return (
    <details className="group rounded-xl border border-ink-700 bg-ink-900/70 open:border-ink-600">
      <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3.5 [&::-webkit-details-marker]:hidden">
        <ChevronDown className="h-4 w-4 shrink-0 text-ink-500 transition-transform group-open:rotate-180" />
        <span className="text-sm font-semibold text-ink-100">{profile.display_name}</span>
        <span className="font-mono text-[11px] text-ink-500">{providerId}</span>
        <span className="ml-auto flex items-center gap-2">
          <Badge tone="muted">{profile.known_dns.length} domains</Badge>
          <Badge tone="muted">{profile.sample_stream_ids.length} stream ids</Badge>
          <Badge tone={source ? "signal" : "info"}>
            {source ? "yours" : "built-in"}
          </Badge>
        </span>
      </summary>

      <div className="grid gap-5 border-t border-ink-700/70 px-4 py-4 text-xs sm:grid-cols-2">
        <div>
          <div className="mb-1.5 text-[10px] font-semibold tracking-widest text-ink-500 uppercase">
            Known domains
          </div>
          <div className="flex flex-wrap gap-1.5">
            {profile.known_dns.length > 0 ? (
              profile.known_dns.map((d) => (
                <span key={d} className="rounded border border-ink-700 bg-ink-950 px-2 py-0.5 font-mono text-[11px] text-ink-300">
                  {d}
                </span>
              ))
            ) : (
              <span className="text-ink-500">none recorded</span>
            )}
          </div>

          <div className="mt-3 mb-1.5 text-[10px] font-semibold tracking-widest text-ink-500 uppercase">
            Expected shape
          </div>
          <ul className="space-y-1 text-ink-300">
            <li>
              Streams: <span className="font-mono">{profile.stream_count_range[0].toLocaleString()} – {profile.stream_count_range[1].toLocaleString()}</span>
            </li>
            <li>
              Categories: <span className="font-mono">{profile.category_count_range[0]} – {profile.category_count_range[1]}</span>
            </li>
            <li>
              Samples: <span className="font-mono">{profile.sample_category_ids.length}</span> category IDs,{" "}
              <span className="font-mono">{profile.sample_stream_ids.length}</span> stream IDs
            </li>
            <li>
              Server: <span className="font-mono">{profile.server_software ?? "unknown"}</span>
              {profile.timezone ? <span className="text-ink-500"> · {profile.timezone}</span> : null}
            </li>
          </ul>
        </div>

        <div>
          <div className="mb-1.5 text-[10px] font-semibold tracking-widest text-ink-500 uppercase">
            Identifiers
          </div>
          <ul className="space-y-1 text-ink-300">
            {naming.quirks.length > 0 ? (
              naming.quirks.map((q) => (
                <li key={q} className="flex gap-2">
                  <span className="text-signal-600">›</span>
                  {q}
                </li>
              ))
            ) : (
              <li>
                Naming: <span className="font-mono">{naming.separator_char || "free-form"}</span>
                {naming.uses_unicode_stars ? " + stars" : ""}
              </li>
            )}
            {profile.logo_domains.length > 0 ? (
              <li className="break-all">
                Logos: <span className="font-mono">{profile.logo_domains.join(", ")}</span>
              </li>
            ) : null}
          </ul>

          <div className="mt-3 mb-1.5 text-[10px] font-semibold tracking-widest text-ink-500 uppercase">
            Category order sample
          </div>
          <div className="space-y-0.5 font-mono text-[11px] text-ink-400">
            {profile.category_names_ordered.slice(0, 6).map((n, i) => (
              <div key={`${n}-${i}`}>{i + 1}. {n}</div>
            ))}
          </div>

          {source ? (
            <p className="mt-3 text-[11px] text-ink-500">
              Promoted from scan “{source}”{createdAt ? ` · ${formatDate(createdAt)}` : ""}
            </p>
          ) : null}
        </div>
      </div>
    </details>
  );
}

export default function Providers() {
  const data = useQuery(api.providers.list);

  if (!data) return <div className="terminal p-6 text-ink-500">Loading providers…</div>;

  return (
    <div>
      <SectionTitle sub="Every new scan is scored against these profiles. Promote unknown scans to grow the database.">
        Known providers
      </SectionTitle>

      {data.user.length > 0 ? (
        <div className="mb-6 space-y-3">
          <h3 className="text-xs font-semibold tracking-widest text-signal-500 uppercase">
            Your providers
          </h3>
          {data.user.map((p) => (
            <ProviderCard
              key={p.provider_id}
              providerId={p.provider_id}
              profile={p.profile}
              source={p.source_scan}
              createdAt={p.created_at}
            />
          ))}
        </div>
      ) : (
        <Card className="mb-6 p-4">
          <p className="text-sm text-ink-400">
            You haven't promoted any providers yet. When a scan comes back with{" "}
            <strong className="text-ink-200">No matches found</strong>, open it and use{" "}
            <strong className="text-ink-200">Save as known provider</strong> — future scans will
            then identify that source instantly, through any of its domains.
          </p>
        </Card>
      )}

      <div className="space-y-3">
        <h3 className="text-xs font-semibold tracking-widest text-info-500 uppercase">
          Built-in profiles
        </h3>
        {data.builtin.map((p) => (
          <ProviderCard key={p.provider_id} providerId={p.provider_id} profile={p.profile} />
        ))}
      </div>
    </div>
  );
}
