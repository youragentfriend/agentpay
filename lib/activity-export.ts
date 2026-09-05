import type { ActivityEvent } from "@/lib/server/activity-store";

export const ACTIVITY_CSV_COLUMNS = ["occurredAt","activityType","source","status","statusGroup","amount","asset","title","summary","reference"] as const;

export function csvCell(value: unknown): string {
  const raw=value===null||value===undefined?"":String(value);
  const text=/^[=+\-@]/.test(raw) ? `'${raw}` : raw;
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"','""')}"` : text;
}

export function activityEventsToCsv(events: ActivityEvent[]): string {
  const rows=[ACTIVITY_CSV_COLUMNS.join(","),...events.map(event=>ACTIVITY_CSV_COLUMNS.map(column=>csvCell(event[column])).join(","))];
  return `\uFEFF${rows.join("\r\n")}\r\n`;
}
