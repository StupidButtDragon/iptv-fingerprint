// CSV export for a scan's channel list — same columns as the Python exporter.
import type { ChannelRow } from "./types";

function escapeCell(value: string): string {
  if (/[",\n\r]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

export function channelsToCsv(rows: ChannelRow[]): string {
  const header = [
    "category_id",
    "category_name",
    "stream_id",
    "channel_name",
    "epg_channel_id",
    "stream_icon",
  ];
  const lines = [header.join(",")];
  for (const row of rows) {
    lines.push(
      [
        row.category_id,
        row.category_name,
        row.stream_id,
        row.channel_name,
        row.epg_channel_id,
        row.stream_icon,
      ]
        .map(escapeCell)
        .join(","),
    );
  }
  return lines.join("\n");
}

// Top categories by channel count, for the post-export summary.
export function topCategories(rows: ChannelRow[], limit = 20): { name: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const name = row.category_name || "Uncategorized";
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}
