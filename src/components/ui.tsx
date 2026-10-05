import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

const baseInput =
  "w-full rounded-lg border border-ink-600 bg-ink-950 px-3 py-2 text-sm text-ink-100 placeholder:text-ink-500 " +
  "outline-none transition-colors focus:border-signal-600 focus:ring-2 focus:ring-signal-600/25 disabled:opacity-50";

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${baseInput} ${props.className ?? ""}`} />;
}

export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={`${baseInput} font-mono text-xs ${props.className ?? ""}`} />;
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select {...props} className={`${baseInput} appearance-none ${props.className ?? ""}`} />
  );
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-medium tracking-wide text-ink-300">{label}</span>
      {children}
      {hint ? <span className="text-[11px] leading-4 text-ink-500">{hint}</span> : null}
    </label>
  );
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "outline" | "ghost" | "danger";
  size?: "sm" | "md";
};

export function Button({ variant = "primary", size = "md", className = "", ...rest }: ButtonProps) {
  const variants: Record<string, string> = {
    primary:
      "bg-signal-500 text-ink-950 hover:bg-signal-400 disabled:hover:bg-signal-500 font-semibold",
    outline:
      "border border-ink-600 bg-ink-900 text-ink-200 hover:border-signal-600 hover:text-signal-400",
    ghost: "text-ink-300 hover:bg-ink-800 hover:text-ink-100",
    danger: "border border-alert-500/40 bg-alert-950 text-alert-400 hover:bg-alert-500/15",
  };
  const sizes: Record<string, string> = {
    sm: "px-3 py-1.5 text-xs",
    md: "px-4 py-2.5 text-sm",
  };
  return (
    <button
      {...rest}
      className={`inline-flex items-center justify-center gap-2 rounded-lg transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${variants[variant]} ${sizes[size]} ${className}`}
    />
  );
}

export function Card({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`rounded-xl border border-ink-700 bg-ink-900/70 ${className}`}>{children}</div>
  );
}

const badgeTones: Record<string, string> = {
  signal: "border-signal-600/40 bg-signal-950 text-signal-400",
  info: "border-info-500/40 bg-info-950 text-info-400",
  amber: "border-amber-500/40 bg-amber-950 text-amber-400",
  alert: "border-alert-500/40 bg-alert-950 text-alert-400",
  muted: "border-ink-600 bg-ink-800 text-ink-300",
};

export function Badge({
  tone = "muted",
  children,
  className = "",
}: {
  tone?: keyof typeof badgeTones | string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold tracking-wide uppercase ${
        badgeTones[tone] ?? badgeTones.muted
      } ${className}`}
    >
      {children}
    </span>
  );
}

export function Spinner({ className = "" }: { className?: string }) {
  return (
    <span
      className={`inline-block h-4 w-4 animate-spin rounded-full border-2 border-ink-500 border-t-signal-400 ${className}`}
    />
  );
}

export function SectionTitle({ children, sub }: { children: ReactNode; sub?: string }) {
  return (
    <div className="mb-4">
      <h2 className="text-base font-semibold tracking-tight text-ink-100">{children}</h2>
      {sub ? <p className="mt-0.5 text-sm text-ink-400">{sub}</p> : null}
    </div>
  );
}

export function Notice({
  tone = "muted",
  children,
}: {
  tone?: "signal" | "amber" | "alert" | "muted";
  children: ReactNode;
}) {
  const tones: Record<string, string> = {
    signal: "border-signal-600/40 bg-signal-950/60 text-signal-300",
    amber: "border-amber-500/40 bg-amber-950/60 text-amber-400",
    alert: "border-alert-500/40 bg-alert-950/60 text-alert-400",
    muted: "border-ink-700 bg-ink-850 text-ink-300",
  };
  return (
    <div className={`rounded-lg border px-3.5 py-2.5 text-sm leading-5 ${tones[tone]}`}>
      {children}
    </div>
  );
}

export function Stat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rounded-lg border border-ink-700 bg-ink-950/60 px-3 py-2.5">
      <div className="text-[10px] font-medium tracking-widest text-ink-500 uppercase">
        {label}
      </div>
      <div className="mt-0.5 font-mono text-sm text-ink-100">{value}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Modal
// ---------------------------------------------------------------------------

export function Modal({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink-950/80 p-4 pt-20 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-lg rounded-xl border border-ink-600 bg-ink-900 shadow-2xl">
        <div className="flex items-center justify-between border-b border-ink-700 px-5 py-3.5">
          <h3 className="text-sm font-semibold tracking-wide text-ink-100">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-ink-400 transition-colors hover:bg-ink-800 hover:text-ink-100"
            aria-label="Close"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="px-5 py-4">{children}</div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Verdicts
// ---------------------------------------------------------------------------

export type VerdictTone = "signal" | "info" | "amber" | "alert" | "muted";

export function verdictTone(verdict: string): VerdictTone {
  switch (verdict) {
    case "MATCH":
      return "signal";
    case "LIKELY":
      return "info";
    case "POSSIBLE":
      return "amber";
    default:
      return "muted";
  }
}

export function verdictIcon(verdict: string): string {
  switch (verdict) {
    case "MATCH":
      return "***";
    case "LIKELY":
      return "**";
    case "POSSIBLE":
      return "*";
    default:
      return ".";
  }
}

export function compareTone(verdict: string): VerdictTone {
  if (verdict.startsWith("SAME SOURCE")) return "signal";
  if (verdict.startsWith("LIKELY")) return "info";
  if (verdict.startsWith("POSSIBLY") || verdict.startsWith("WEAK")) return "amber";
  return "alert";
}

// ---------------------------------------------------------------------------
// Brand marks
// ---------------------------------------------------------------------------

export function LogoMark({ className = "h-7 w-7" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} fill="none" aria-hidden>
      <rect x="1.5" y="1.5" width="29" height="29" rx="7" stroke="currentColor" strokeWidth="2" opacity="0.55" />
      <path d="M6 21c3.5 0 3.5-10 7-10s3.5 10 7 10 3.5-10 6-10" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
      <circle cx="16" cy="16" r="2.4" fill="currentColor" />
    </svg>
  );
}

export function GitHubMark({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" className={className} fill="currentColor" aria-hidden>
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.4 7.4 0 0 1 2-.27c.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
    </svg>
  );
}
