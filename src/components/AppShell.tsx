import { Crosshair, Database, GitCompare, ListChecks, Radar } from "lucide-react";
import { Link, NavLink, Outlet } from "react-router-dom";
import { GitHubMark, LogoMark } from "./ui";

const NAV = [
  { to: "/app", end: true, icon: Crosshair, label: "Identify" },
  { to: "/app/scans", end: false, icon: ListChecks, label: "Saved scans" },
  { to: "/app/compare", end: false, icon: GitCompare, label: "Compare" },
  { to: "/app/investigate", end: false, icon: Radar, label: "Investigate" },
  { to: "/app/providers", end: false, icon: Database, label: "Providers" },
];

function NavItem({
  to,
  end,
  icon: Icon,
  label,
}: {
  to: string;
  end: boolean;
  icon: typeof Crosshair;
  label: string;
}) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        `group flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors ${
          isActive
            ? "bg-ink-800 font-medium text-signal-400"
            : "text-ink-300 hover:bg-ink-850 hover:text-ink-100"
        }`
      }
    >
      <Icon className="h-4 w-4 shrink-0 opacity-80" />
      <span>{label}</span>
    </NavLink>
  );
}

export default function AppShell() {
  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      <aside className="border-b border-ink-700 bg-ink-900/70 lg:sticky lg:top-0 lg:h-screen lg:w-60 lg:shrink-0 lg:border-r lg:border-b-0">
        <div className="flex flex-col gap-6 p-4 lg:h-full">
          <div className="flex items-center justify-between gap-3">
            <Link to="/" className="flex items-center gap-2.5 text-signal-400">
              <LogoMark className="h-7 w-7" />
              <span className="text-sm font-bold tracking-tight text-ink-100">
                IPTV Fingerprint
              </span>
            </Link>
            <Link
              to="/"
              className="text-[11px] text-ink-500 transition-colors hover:text-ink-200"
            >
              ← Site
            </Link>
          </div>

          <nav className="flex gap-1.5 overflow-x-auto lg:flex-col lg:overflow-visible">
            {NAV.map((item) => (
              <div key={item.to} className="shrink-0 lg:shrink">
                <NavItem {...item} />
              </div>
            ))}
          </nav>

          <div className="mt-auto hidden gap-3 text-[11px] text-ink-500 lg:flex lg:flex-col">
            <p className="leading-4">
              Your provider logins are sent only to the provider itself — never anywhere else.
            </p>
            <a
              href="https://github.com/cage47/iptv-fingerprint"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 text-ink-400 transition-colors hover:text-signal-400"
            >
              <GitHubMark className="h-3.5 w-3.5" />
              cage47/iptv-fingerprint
            </a>
          </div>
        </div>
      </aside>

      <main className="min-w-0 flex-1">
        <div className="mx-auto max-w-5xl px-5 py-7 lg:px-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
