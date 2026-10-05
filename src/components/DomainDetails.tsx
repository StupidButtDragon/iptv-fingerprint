import type { DnsEntry } from "../lib/types";

export default function DomainDetails({ entry }: { entry: DnsEntry }) {
  const { dns, headers, whois, osint } = entry;
  const shodan = (osint as any)?.shodan_internetdb as
    | { ports?: number[]; hostnames?: string[]; cpes?: string[]; vulns?: string[] }
    | null
    | undefined;
  const ipInfo = Object.values(dns.ip_info ?? {}) as {
    org?: string;
    city?: string;
    country?: string;
    hostname?: string;
  }[];

  return (
    <div className="grid gap-4 border-t border-ink-700 bg-ink-950/50 px-4 py-4 text-xs sm:grid-cols-2">
      <div>
        <div className="mb-1.5 text-[10px] font-semibold tracking-widest text-ink-500 uppercase">
          DNS records
        </div>
        <dl className="space-y-1 text-ink-300">
          <div><dt className="inline text-ink-500">A: </dt><dd className="inline font-mono">{dns.a_records.join(", ") || "—"}</dd></div>
          <div><dt className="inline text-ink-500">MX: </dt><dd className="inline font-mono">{dns.mx_records.join(", ") || "—"}</dd></div>
          <div><dt className="inline text-ink-500">NS: </dt><dd className="inline font-mono">{dns.ns_records.slice(0, 4).join(", ") || "—"}</dd></div>
          <div><dt className="inline text-ink-500">TXT: </dt><dd className="inline font-mono break-all">{dns.txt_records.slice(0, 2).join(" ") || "—"}</dd></div>
        </dl>
        {ipInfo.length > 0 ? (
          <p className="mt-2 text-ink-400">
            {ipInfo[0].org ?? "unknown org"} · {ipInfo[0].city ?? "?"}, {ipInfo[0].country ?? "?"}
          </p>
        ) : null}
      </div>

      <div>
        <div className="mb-1.5 text-[10px] font-semibold tracking-widest text-ink-500 uppercase">
          TLS & headers
        </div>
        <dl className="space-y-1 text-ink-300">
          <div><dt className="inline text-ink-500">Server: </dt><dd className="inline font-mono">{headers.server_software ?? "—"}</dd></div>
          <div><dt className="inline text-ink-500">Cloudflare: </dt><dd className="inline">{headers.cloudflare ? `yes (${headers.cf_ray ?? ""})` : "no"}</dd></div>
          <div><dt className="inline text-ink-500">CDN: </dt><dd className="inline">{headers.cdn_detected ?? "—"}</dd></div>
          <div><dt className="inline text-ink-500">Issuer: </dt><dd className="inline break-all">{headers.ssl_issuer ?? "—"}</dd></div>
          <div><dt className="inline text-ink-500">SANs: </dt><dd className="inline break-all">{headers.ssl_sans.slice(0, 4).join(", ") || "—"}</dd></div>
          {headers.panel_fingerprint ? (
            <div><dt className="inline text-ink-500">Panel: </dt><dd className="inline font-mono">port {headers.panel_fingerprint.port} · HTTP {headers.panel_fingerprint.status}</dd></div>
          ) : null}
        </dl>
      </div>

      <div>
        <div className="mb-1.5 text-[10px] font-semibold tracking-widest text-ink-500 uppercase">
          Registration (RDAP)
        </div>
        {whois ? (
          <dl className="space-y-1 text-ink-300">
            <div><dt className="inline text-ink-500">Registrar: </dt><dd className="inline">{whois.registrar ?? "—"}</dd></div>
            <div><dt className="inline text-ink-500">Created: </dt><dd className="inline font-mono">{whois.creation_date ?? "—"}</dd></div>
            <div><dt className="inline text-ink-500">Expires: </dt><dd className="inline font-mono">{whois.expiry_date ?? "—"}</dd></div>
            <div><dt className="inline text-ink-500">Privacy: </dt><dd className="inline">{whois.privacy_protected ? "protected" : "not detected"}</dd></div>
            <div><dt className="inline text-ink-500">NS: </dt><dd className="inline font-mono">{whois.nameservers.slice(0, 3).join(", ") || "—"}</dd></div>
          </dl>
        ) : (
          <p className="text-ink-500">Not looked up for this domain.</p>
        )}
      </div>

      <div>
        <div className="mb-1.5 text-[10px] font-semibold tracking-widest text-ink-500 uppercase">
          OSINT & cert history
        </div>
        <dl className="space-y-1 text-ink-300">
          <div><dt className="inline text-ink-500">crt.sh: </dt><dd className="inline">{dns.crt_sh.length} certs</dd></div>
          <div><dt className="inline text-ink-500">Same IP: </dt><dd className="inline">{dns.reverse_ip_domains.length} domains</dd></div>
          {shodan ? (
            <>
              <div><dt className="inline text-ink-500">Ports: </dt><dd className="inline font-mono">{(shodan.ports ?? []).join(", ") || "—"}</dd></div>
              <div><dt className="inline text-ink-500">Vulns: </dt><dd className="inline">{(shodan.vulns ?? []).length || "none known"}</dd></div>
            </>
          ) : null}
        </dl>
        {dns.reverse_ip_domains.length > 0 ? (
          <p className="mt-2 break-all text-ink-400">
            {dns.reverse_ip_domains.slice(0, 6).join(", ")}
            {dns.reverse_ip_domains.length > 6 ? " …" : ""}
          </p>
        ) : null}
      </div>
    </div>
  );
}
