function toMountainDate(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Denver" })
    .format(d)
    .replace(/-/g, "");
}

function mountainDow(d: Date): number {
  const name = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Denver",
    weekday: "short",
  }).format(d);
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(name);
}

export function mountainMidnightUTC(yyyymmdd: string): number {
  const y = Number.parseInt(yyyymmdd.slice(0, 4));
  const m = Number.parseInt(yyyymmdd.slice(4, 6));
  const d = Number.parseInt(yyyymmdd.slice(6, 8));

  const trialMs = Date.UTC(y, m - 1, d, 7, 0, 0);
  const mtHour = Number.parseInt(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Denver",
      hour: "2-digit",
      hour12: false,
    }).format(trialMs),
  );

  if (mtHour === 0) return trialMs / 1000;
  if (mtHour === 1) return (trialMs - 3_600_000) / 1000;
  return (trialMs - mtHour * 3_600_000) / 1000;
}

export interface ServiceCalendar {
  regular: Map<string, { days: boolean[]; start: string; end: string }>;
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

  for (const [svcId, exc] of cal.exceptions) {
    if (exc.removed.has(dateStr)) active.delete(svcId);
    if (exc.added.has(dateStr)) active.add(svcId);
  }

  return active;
}

export function parseCalendarRow(
  row: Record<string, string>,
): [string, ServiceCalendar["regular"] extends Map<string, infer V> ? V : never] {
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
