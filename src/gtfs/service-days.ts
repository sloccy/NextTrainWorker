// Returns the Mountain-TZ date string "YYYYMMDD" for the given Date
function toMountainDate(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Denver" })
    .format(d)           // "2026-05-02"
    .replace(/-/g, "");  // "20260502"
}

// Returns day-of-week (0=Sun … 6=Sat) in Mountain TZ
function mountainDow(d: Date): number {
  const name = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Denver",
    weekday: "short",
  }).format(d);
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(name);
}

// Returns the UTC unix seconds for midnight America/Denver on the given "YYYYMMDD" string
export function mountainMidnightUTC(yyyymmdd: string): number {
  const y = parseInt(yyyymmdd.slice(0, 4));
  const m = parseInt(yyyymmdd.slice(4, 6));
  const d = parseInt(yyyymmdd.slice(6, 8));

  // Try 7am UTC (= midnight MST, UTC-7). If Mountain TZ says it's 01:00 at that point,
  // it's MDT (UTC-6) and we need 6am UTC instead.
  const trialMs = Date.UTC(y, m - 1, d, 7, 0, 0);
  const mtHour = parseInt(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Denver",
      hour: "2-digit",
      hour12: false,
    }).format(trialMs)
  );

  if (mtHour === 0) return trialMs / 1000;          // MST: 7am UTC = midnight Mountain
  if (mtHour === 1) return (trialMs - 3_600_000) / 1000; // MDT: 6am UTC = midnight Mountain
  // Fallback: shift by the observed offset
  return (trialMs - mtHour * 3_600_000) / 1000;
}

export interface ServiceCalendar {
  // service_id → weekly bitmask [Sun..Sat] + date range
  regular: Map<string, { days: boolean[]; start: string; end: string }>;
  // service_id → {added: Set<YYYYMMDD>, removed: Set<YYYYMMDD>}
  exceptions: Map<string, { added: Set<string>; removed: Set<string> }>;
}

export function activeServiceIds(date: Date, cal: ServiceCalendar): Set<string> {
  const dateStr = toMountainDate(date);
  const dow = mountainDow(date);
  const active = new Set<string>();

  for (const [svcId, info] of cal.regular) {
    if (dateStr >= info.start && dateStr <= info.end && info.days[dow]) {
      active.add(svcId);
    }
  }

  // Apply exceptions
  for (const [svcId, exc] of cal.exceptions) {
    if (exc.removed.has(dateStr)) active.delete(svcId);
    if (exc.added.has(dateStr))   active.add(svcId);
  }

  return active;
}

export function parseCalendarRow(row: Record<string, string>): [string, ServiceCalendar["regular"] extends Map<string, infer V> ? V : never] {
  return [
    row.service_id,
    {
      days: [
        row.sunday === "1",
        row.monday === "1",
        row.tuesday === "1",
        row.wednesday === "1",
        row.thursday === "1",
        row.friday === "1",
        row.saturday === "1",
      ],
      start: row.start_date,
      end: row.end_date,
    },
  ];
}
