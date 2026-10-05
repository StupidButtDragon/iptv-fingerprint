// Small shared formatting helpers.
export function formatNum(n: number): string {
  return n.toLocaleString("en-US");
}

export function formatDate(ms: number): string {
  try {
    return new Date(ms).toLocaleString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return new Date(ms).toISOString();
  }
}

export function scoreBarColor(score: number): string {
  if (score >= 50) return "bg-signal-500";
  if (score >= 25) return "bg-info-500";
  if (score >= 10) return "bg-amber-500";
  return "bg-ink-500";
}
