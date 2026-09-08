export type ActivityRangePreset = "all" | "today" | "week" | "month" | "quarter" | "year" | "custom";

function validTimeZone(value: string) {
  try { new Intl.DateTimeFormat("en", { timeZone: value }).format(); return value; }
  catch { return "UTC"; }
}

function parts(date: Date, timeZone: string) {
  const values = new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  const get = (type: string) => values.find(part => part.type === type)?.value || "";
  return { year: Number(get("year")), month: Number(get("month")), day: Number(get("day")) };
}

function key(year: number, month: number, day: number) {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function shiftKey(value: string, days: number) {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return key(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
}

function shiftMonth(value: string, months: number) {
  const [year, month] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1 + months, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function validDateKey(value?: string) {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(`${value}T00:00:00Z`)));
}

function zonedStart(value: string, timeZone: string) {
  const [year, month, day] = value.split("-").map(Number);
  const target = Date.UTC(year, month - 1, day);
  let candidate = target;
  for (let index = 0; index < 3; index += 1) {
    const local = parts(new Date(candidate), timeZone);
    const rendered = Date.UTC(local.year, local.month - 1, local.day);
    candidate += target - rendered;
    const hourParts = new Intl.DateTimeFormat("en-US", { timeZone, hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).formatToParts(new Date(candidate));
    const get = (type: string) => Number(hourParts.find(part => part.type === type)?.value || 0);
    candidate -= ((get("hour") * 60 + get("minute")) * 60 + get("second")) * 1000;
  }
  return new Date(candidate);
}

export function activityDateRange(preset: ActivityRangePreset, requestedTimeZone: string, customFrom?: string, customTo?: string, now = new Date()) {
  const timeZone = validTimeZone(requestedTimeZone);
  if (preset === "all") return { timeZone, fromKey: undefined, toKey: undefined, from: undefined, to: undefined };
  const current = parts(now, timeZone);
  const today = key(current.year, current.month, current.day);
  let fromKey = today;
  let toKey = today;
  if (preset === "week") fromKey = shiftKey(today, -6);
  if (preset === "month") fromKey = `${today.slice(0, 7)}-01`;
  if (preset === "quarter") fromKey = `${shiftMonth(today.slice(0, 7), -2)}-01`;
  if (preset === "year") fromKey = `${today.slice(0, 4)}-01-01`;
  if (preset === "custom") {
    fromKey = validDateKey(customFrom) ? customFrom! : validDateKey(customTo) ? customTo! : today;
    toKey = validDateKey(customTo) ? customTo! : fromKey;
    if (fromKey > toKey) [fromKey, toKey] = [toKey, fromKey];
    if (toKey > today) toKey = today;
    if (fromKey > today) fromKey = today;
  }
  return {
    timeZone,
    fromKey,
    toKey,
    from: zonedStart(fromKey, timeZone).toISOString(),
    to: new Date(zonedStart(shiftKey(toKey, 1), timeZone).getTime() - 1).toISOString(),
  };
}
