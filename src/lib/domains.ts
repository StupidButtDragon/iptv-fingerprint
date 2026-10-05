// Port of the CLI's domain/CSV parsing helpers (pure, shared by client+server).
export function splitCsv(value: string | undefined | null): string[] {
  return (value ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

// Comma-separated domains or full URLs -> unique lowercase hostnames.
export function parseDomains(value: string | undefined | null): string[] {
  const domains: string[] = [];
  for (let d of splitCsv(value)) {
    d = d.toLowerCase();
    if (d.includes("://")) {
      try {
        d = new URL(d).hostname || d;
      } catch {
        /* keep as-is */
      }
    }
    d = d.split(":")[0];
    if (d && !domains.includes(d)) domains.push(d);
  }
  return domains;
}

export function hostnameOfUrl(value: string): string | null {
  try {
    const url = new URL(value.includes("://") ? value : `http://${value}`);
    return url.hostname || null;
  } catch {
    return null;
  }
}

export function portOfUrl(value: string): number | undefined {
  try {
    const url = new URL(value.includes("://") ? value : `http://${value}`);
    return url.port ? Number(url.port) : undefined;
  } catch {
    return undefined;
  }
}
