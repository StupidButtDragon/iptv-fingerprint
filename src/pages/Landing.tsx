import { motion } from "framer-motion";
import { ArrowRight, Database, Fingerprint, Network, ScanSearch, Server, ShieldCheck, GitCompare, FileDown } from "lucide-react";
import { Link } from "react-router-dom";
import { builtinProviders } from "../lib/providers";
import BannerSlot from "../components/BannerSlot";
import { DonateButton, GitHubMark, LogoMark } from "../components/ui";

const reveal = {
  initial: { opacity: 0, y: 18 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: "-60px" },
  transition: { duration: 0.5, ease: "easeOut" as const },
};

const STEPS = [
  {
    title: "Hand over a login",
    body: "Server URL, username, password — a trial login is enough. Extra backup domains and EPG links get investigated too.",
  },
  {
    title: "Capture the fingerprint",
    body: "Stream IDs, category IDs and their order, naming style, logo hosts — plus DNS, WHOIS, SSL certificates, Cloudflare, WHOIS and Shodan.",
  },
  {
    title: "Get the verdict",
    body: "Every signal is scored against every provider you know: MATCH, LIKELY, POSSIBLE or a unique source nobody has seen before.",
  },
];

const FEATURES = [
  {
    icon: Fingerprint,
    title: "Rebrand detection",
    body: "Resellers inherit the source panel's stream and category IDs. One profile catches every brand selling the same upstream.",
  },
  {
    icon: Network,
    title: "Infrastructure OSINT",
    body: "DNS records, IP owner, reverse IP, SSL certificate SANs, Cloudflare edge, RDAP registration, crt.sh history, Shodan InternetDB.",
  },
  {
    icon: GitCompare,
    title: "Side-by-side compare",
    body: "Fold two scans together into one weighted confidence score — from “same upstream panel” down to “different sources”.",
  },
  {
    icon: Database,
    title: "Your provider database",
    body: "Promote any scan into a reusable profile with its domains and samples. Every future scan checks against yours.",
  },
  {
    icon: FileDown,
    title: "CSV export",
    body: "Pull the full channel lineup — category, stream ID, EPG ID and logo URL — into a spreadsheet for manual comparison.",
  },
  {
    icon: ShieldCheck,
    title: "Privacy by design",
    body: "Your logins travel to the provider and nowhere else. No trackers, no analytics, no third parties in the middle.",
  },
];

const SIGNALS: [string, string][] = [
  ["Scanned domain is one of the provider's known domains", "40"],
  ["Stream ID overlap with sample IDs", "up to 30"],
  ["Category ID overlap", "up to 15"],
  ["Category names in common", "up to 10"],
  ["Shared logo hosts", "up to 8"],
  ["Shared categories in the same order", "5"],
  ["Same naming style (pipes, brackets, stars)", "3"],
  ["Channel count within the expected range", "2"],
  ["Same server software", "1"],
];

const builtinEntries = Object.entries(builtinProviders);

function MatchCard() {
  return (
    <div className="terminal relative overflow-hidden p-5">
      <div className="mb-3 flex items-center justify-between text-[10px] tracking-widest text-ink-500 uppercase">
        <span>Known provider matching</span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-signal-400" />
          live
        </span>
      </div>
      <div className="space-y-2.5">
        <div className="text-sm">
          <span className="font-bold text-signal-400 text-glow">***</span>{" "}
          <span className="font-semibold text-ink-100">T-Rex IPTV</span>{" "}
          <span className="rounded bg-signal-950 px-1.5 py-0.5 text-[11px] font-bold tracking-wide text-signal-400">
            MATCH
          </span>{" "}
          <span className="text-ink-500">(score: 114)</span>
        </div>
        <div className="space-y-1 pl-3 text-[11.5px] text-ink-300">
          <div>DNS hostname matches known entry: line.hydrax.club</div>
          <div>Stream ID overlap: 30/30 sample IDs match (100%)</div>
          <div>Category ID overlap: 30/30 (100%)</div>
          <div>Shared logo domains: 103.176.90.118, line.cdn.trex</div>
        </div>
        <div className="pt-1 text-[11.5px] text-ink-500">
          BEST MATCH: T-Rex IPTV (MATCH, score: 114)
          <span className="ml-1 inline-block h-3.5 w-1.5 translate-y-0.5 animate-pulse bg-signal-400/80" />
        </div>
      </div>
    </div>
  );
}

export default function Landing() {
  return (
    <div className="min-h-screen">
      {/* Nav */}
      <header className="sticky top-0 z-40 border-b border-ink-800 bg-ink-950/85 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-3.5">
          <Link to="/" className="flex items-center gap-2.5 text-signal-400">
            <LogoMark className="h-7 w-7" />
            <span className="text-sm font-bold tracking-tight text-ink-100">
              IPTV Fingerprint
            </span>
          </Link>
          <nav className="hidden items-center gap-6 text-sm text-ink-400 md:flex">
            <a href="#how" className="transition-colors hover:text-ink-100">How it works</a>
            <a href="#signals" className="transition-colors hover:text-ink-100">Signals</a>
            <a href="#providers" className="transition-colors hover:text-ink-100">Providers</a>
            <a
              href="https://github.com/cage47/iptv-fingerprint"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 transition-colors hover:text-ink-100"
            >
              <GitHubMark className="h-4 w-4" />
              GitHub
            </a>
          </nav>
          <Link
            to="/app"
            className="inline-flex items-center gap-1.5 rounded-lg bg-signal-500 px-4 py-2 text-sm font-semibold text-ink-950 transition-colors hover:bg-signal-400"
          >
            Open the tool <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="grid-bg absolute inset-0" aria-hidden />
        <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-5 pt-20 pb-24 lg:grid-cols-2 lg:pt-28">
          <div>
            <motion.div
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
            >
              <span className="inline-flex items-center gap-2 rounded-full border border-signal-600/40 bg-signal-950/70 px-3 py-1 text-[11px] font-semibold tracking-widest text-signal-400 uppercase">
                <ScanSearch className="h-3.5 w-3.5" /> Open source · CLI + web app
              </span>
              <h1 className="mt-5 text-4xl leading-[1.08] font-bold tracking-tight text-ink-100 sm:text-5xl">
                Is your IPTV provider its own service —
                <span className="text-signal-400 text-glow"> or a rebrand?</span>
              </h1>
              <p className="mt-5 max-w-xl text-base leading-7 text-ink-300">
                Give it a provider's Xtream login. It downloads the channel list, fingerprints the
                stream and category IDs, digs into the server's infrastructure, and tells you
                which known provider you're really watching.
              </p>
              <div className="mt-7 flex flex-wrap items-center gap-3">
                <Link
                  to="/app"
                  className="inline-flex items-center gap-2 rounded-lg bg-signal-500 px-5 py-3 text-sm font-semibold text-ink-950 transition-all hover:bg-signal-400 hover:shadow-[0_0_28px_rgba(47,212,119,0.35)]"
                >
                  Identify a provider <ArrowRight className="h-4 w-4" />
                </Link>
                <a
                  href="https://github.com/cage47/iptv-fingerprint"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-2 rounded-lg border border-ink-600 bg-ink-900 px-5 py-3 text-sm font-medium text-ink-200 transition-colors hover:border-signal-600 hover:text-signal-400"
                >
                  <GitHubMark className="h-4 w-4" /> View source
                </a>
              </div>
              <dl className="mt-9 grid max-w-lg grid-cols-3 gap-4 border-t border-ink-800 pt-5">
                {[
                  ["4", "built-in profiles"],
                  ["9", "matching signals"],
                  ["0", "API keys required"],
                ].map(([value, label]) => (
                  <div key={label}>
                    <dt className="font-mono text-xl font-bold text-signal-400">{value}</dt>
                    <dd className="mt-0.5 text-[11px] tracking-wide text-ink-500 uppercase">
                      {label}
                    </dd>
                  </div>
                ))}
              </dl>
            </motion.div>
          </div>

          <motion.div
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.6, delay: 0.15 }}
            className="relative"
          >
            <div
              className="absolute -inset-6 rounded-3xl bg-signal-500/10 blur-3xl"
              aria-hidden
            />
            <div className="relative">
              <MatchCard />
            </div>
          </motion.div>
        </div>
      </section>

      <BannerSlot id="landing-top" />

      {/* How it works */}
      <section id="how" className="border-t border-ink-800 bg-ink-900/40">
        <div className="mx-auto max-w-6xl px-5 py-20">
          <motion.div {...reveal}>
            <h2 className="text-2xl font-bold tracking-tight text-ink-100">How it works</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-ink-400">
              The same fingerprinting pipeline as the Python CLI, now with a live console instead
              of scrolling terminal output.
            </p>
          </motion.div>
          <div className="mt-10 grid gap-5 md:grid-cols-3">
            {STEPS.map((step, i) => (
              <motion.div
                key={step.title}
                {...reveal}
                transition={{ ...reveal.transition, delay: i * 0.08 }}
                className="relative rounded-xl border border-ink-700 bg-ink-900/70 p-6"
              >
                <span className="font-mono text-xs font-bold text-signal-600">
                  0{i + 1}
                </span>
                <h3 className="mt-2 text-base font-semibold text-ink-100">{step.title}</h3>
                <p className="mt-2 text-sm leading-6 text-ink-400">{step.body}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="border-t border-ink-800">
        <div className="mx-auto max-w-6xl px-5 py-20">
          <motion.h2
            {...reveal}
            className="text-2xl font-bold tracking-tight text-ink-100"
          >
            Everything one scan learns
          </motion.h2>
          <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f, i) => (
              <motion.div
                key={f.title}
                {...reveal}
                transition={{ ...reveal.transition, delay: (i % 3) * 0.06 }}
                className="group rounded-xl border border-ink-700 bg-ink-900/70 p-6 transition-colors hover:border-signal-700/60"
              >
                <f.icon className="h-5 w-5 text-signal-500 transition-transform group-hover:scale-110" />
                <h3 className="mt-3 text-sm font-semibold text-ink-100">{f.title}</h3>
                <p className="mt-1.5 text-[13px] leading-6 text-ink-400">{f.body}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Signals / scoring */}
      <section id="signals" className="border-t border-ink-800 bg-ink-900/40">
        <div className="mx-auto grid max-w-6xl gap-10 px-5 py-20 lg:grid-cols-[1fr_340px]">
          <motion.div {...reveal}>
            <h2 className="text-2xl font-bold tracking-tight text-ink-100">
              Nine signals, one honest score
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-ink-400">
              Stream and category IDs come from the source panel's own database — a reseller
              can rebrand everything except those. The scoring table is open for you to read.
            </p>
            <div className="mt-6 overflow-hidden rounded-xl border border-ink-700">
              <table className="w-full text-sm">
                <tbody>
                  {SIGNALS.map(([signal, points], i) => (
                    <tr
                      key={signal}
                      className={i % 2 === 0 ? "bg-ink-900/70" : "bg-ink-950/60"}
                    >
                      <td className="px-4 py-2.5 text-ink-300">{signal}</td>
                      <td className="px-4 py-2.5 text-right font-mono font-semibold whitespace-nowrap text-signal-400">
                        {points}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-4 flex flex-wrap gap-2 text-[11px]">
              <span className="rounded border border-signal-600/40 bg-signal-950 px-2.5 py-1 text-signal-400">50+ MATCH</span>
              <span className="rounded border border-info-500/40 bg-info-950 px-2.5 py-1 text-info-400">25–49 LIKELY</span>
              <span className="rounded border border-amber-500/40 bg-amber-950 px-2.5 py-1 text-amber-400">10–24 POSSIBLE</span>
              <span className="rounded border border-ink-600 bg-ink-800 px-2.5 py-1 text-ink-300">&lt;10 WEAK</span>
            </div>
          </motion.div>

          <motion.div {...reveal} className="terminal h-fit p-5 text-[12px]">
            <div className="mb-3 text-[10px] tracking-widest text-ink-500 uppercase">
              fingerprint sample
            </div>
            <div className="space-y-1.5 text-ink-300">
              <div><span className="text-signal-400">api</span> player_api.php</div>
              <div><span className="text-signal-400">categories</span> 830</div>
              <div><span className="text-signal-400">streams</span> 55,500</div>
              <div><span className="text-signal-400">naming</span> |US| pipe style</div>
              <div><span className="text-signal-400">logos</span> 103.176.90.x</div>
              <div><span className="text-signal-400">server</span> nginx · Cloudflare</div>
              <div><span className="text-signal-400">whois</span> registrar, created date, NS</div>
              <div><span className="text-signal-400">shodan</span> open ports, CPEs, vulns</div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Built-in providers */}
      <section id="providers" className="border-t border-ink-800">
        <div className="mx-auto max-w-6xl px-5 py-20">
          <motion.div {...reveal}>
            <h2 className="text-2xl font-bold tracking-tight text-ink-100">
              Ships with {builtinEntries.length} reference providers
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-ink-400">
              Every scan is compared against these out of the box — then you grow your own
              database by promoting the scans that come back unknown.
            </p>
          </motion.div>
          <motion.div
            {...reveal}
            className="mt-8 overflow-x-auto rounded-xl border border-ink-700"
          >
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-ink-700 bg-ink-950/70 text-left text-[11px] tracking-widest text-ink-500 uppercase">
                  <th className="px-4 py-3">Provider</th>
                  <th className="px-4 py-3">Categories</th>
                  <th className="px-4 py-3">Streams</th>
                  <th className="px-4 py-3">Key identifiers</th>
                </tr>
              </thead>
              <tbody>
                {builtinEntries.map(([id, p], i) => (
                  <tr
                    key={id}
                    className={i % 2 === 0 ? "bg-ink-900/60" : "bg-ink-950/50"}
                  >
                    <td className="px-4 py-3 font-medium text-ink-100">{p.display_name}</td>
                    <td className="px-4 py-3 font-mono text-xs text-ink-300">
                      ~{Math.round((p.category_count_range[0] + p.category_count_range[1]) / 2)}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-ink-300">
                      ~{Math.round((p.stream_count_range[0] + p.stream_count_range[1]) / 2).toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-xs text-ink-400">
                      {p.naming_pattern.quirks[0] ?? p.naming_pattern.separator_char}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </motion.div>
        </div>
      </section>

      {/* CTA */}
      <section className="border-t border-ink-800 bg-ink-900/40">
        <div className="mx-auto max-w-6xl px-5 py-20 text-center">
          <motion.div {...reveal}>
            <Server className="mx-auto h-7 w-7 text-signal-500" />
            <h2 className="mt-4 text-2xl font-bold tracking-tight text-ink-100">
              Run your first fingerprint
            </h2>
            <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-ink-400">
              A trial login is enough. Scans save to this deployment, so you can re-match and
              compare them any time.
            </p>
            <Link
              to="/app"
              className="mt-6 inline-flex items-center gap-2 rounded-lg bg-signal-500 px-6 py-3 text-sm font-semibold text-ink-950 transition-all hover:bg-signal-400 hover:shadow-[0_0_28px_rgba(47,212,119,0.35)]"
            >
              Open the tool <ArrowRight className="h-4 w-4" />
            </Link>
          </motion.div>
        </div>
      </section>

      <BannerSlot id="landing-bottom" />

      {/* Footer */}
      <footer className="border-t border-ink-800">
        <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-4 px-5 py-8 text-xs text-ink-500 sm:flex-row sm:items-center">
          <div className="flex items-center gap-2">
            <LogoMark className="h-5 w-5 text-ink-500" />
            <span>
              IPTV Fingerprint — the Python CLI still works exactly as before:{" "}
              <code className="font-mono text-ink-400">
                pip install github.com/cage47/iptv-fingerprint
              </code>
            </span>
          </div>
          <div className="flex items-center gap-5">
            <DonateButton />
            <a
              href="https://github.com/cage47/iptv-fingerprint"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 transition-colors hover:text-signal-400"
            >
              <GitHubMark className="h-3.5 w-3.5" /> Source on GitHub
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
