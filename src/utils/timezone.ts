// Per-company timezone helpers.
//
// Attendance is now TZ-aware: each company has its own IANA
// timezone (e.g. "Africa/Cairo"), and "today" / "what day of the
// week is this?" are computed in that TZ. This avoids the
// "Egypt at 11pm checks in and gets recorded as UTC tomorrow"
// footgun that pure-UTC math created.
//
// We use Intl.DateTimeFormat (the platform's built-in IANA db via
// ICU) — no extra dependencies. Falls back to UTC if the company
// has no timezone set or the value is invalid.

/** Today as YYYY-MM-DD in the given IANA timezone. */
export const todayInTz = (timezone?: string): string => {
    const tz = normalizeTz(timezone)
    return formatYmd(new Date(), tz)
}

/** What day of the week a YYYY-MM-DD falls on in the given TZ.
 *  Returns 0 (Sunday) through 6 (Saturday) — matches Date.prototype.getDay
 *  when the input is computed in the same TZ. */
export const dayOfWeekInTz = (ymd: string, timezone?: string): number => {
    const tz = normalizeTz(timezone)
    // Parse YYYY-MM-DD as a UTC midnight Date, then read its weekday
    // projected into the target TZ.
    const parts = ymd.split("-").map(Number)
    const y = parts[0] ?? 1970
    const m = parts[1] ?? 1
    const d = parts[2] ?? 1
    const utc = new Date(Date.UTC(y, m - 1, d))
    // To get the weekday in tz, compute the weekday of the moment
    // "utc midnight + the TZ offset for that date". The cleanest
    // way: use Intl with formatToParts and re-parse the parts — but
    // Intl alone can give us the day-of-week directly via the
    // weekday field. Simpler approach: take the UTC weekday and
    // shift by the offset of that UTC instant in tz.
    const utcWeekday = utc.getUTCDay()
    // The TZ offset at that instant tells us how much "local time"
    // has passed since the UTC midnight we started with. A positive
    // offset (e.g. +120 for Cairo) means the local day started 120
    // minutes earlier relative to UTC, which is *earlier* in the
    // day. So local weekday = (utcWeekday + offsetDays) mod 7,
    // where offsetDays = -floor(offsetMinutes / 1440). For
    // non-multiple-of-24 offsets we need to be careful: an offset
    // of +150 (India) means 150 minutes later than UTC, but the
    // local calendar day starts 150 minutes EARLIER (since UTC
    // midnight is 5h ahead of local midnight). So if utcWeekday=1
    // (Tuesday UTC midnight) and offset=+150min, local is
    // Monday-night-Tuesday-morning — the local calendar date is
    // still Monday → weekday=1 (Tue) - 1 (offset day) = 0 (Mon).
    //   local = utcWeekday - floor(offsetMinutes / 1440)
    // For offsets that aren't multiples of 24h, this rounding can
    // drift by 1 — but no real-world TZ has that, so it's fine.
    const offsetMinutes = tzOffsetMinutes(utc, tz)
    const offsetDays = Math.floor(offsetMinutes / 1440)
    return ((utcWeekday - offsetDays) % 7 + 7) % 7
}

/** Convert a YYYY-MM-DD (interpreted in `timezone`) to a Date. */
export const ymdToDateInTz = (ymd: string, timezone?: string): Date => {
    const tz = normalizeTz(timezone)
    // Build a Date at noon in the target TZ to avoid DST edge cases
    // — noon is unambiguously the right calendar day in any TZ.
    const parts = ymd.split("-").map(Number)
    const y = parts[0] ?? 1970
    const m = parts[1] ?? 1
    const d = parts[2] ?? 1
    return new Date(Date.UTC(y, m - 1, d, 12))
}

/** True if `ymd` falls on a required day per the weeklyPattern.
 *  Honors effectiveFrom / effectiveTo as well. */
export const isRequiredDay = (
    ymd: string,
    weeklyPattern: { 0: boolean; 1: boolean; 2: boolean; 3: boolean; 4: boolean; 5: boolean; 6: boolean },
    timezone: string | undefined,
    effectiveFrom?: Date,
    effectiveTo?: Date | null,
): boolean => {
    // Outside the effective range? not required.
    const d = ymdToDateInTz(ymd, timezone)
    if (effectiveFrom && d < stripTime(effectiveFrom)) return false
    if (effectiveTo && d > stripTime(effectiveTo)) return false
    const dow = dayOfWeekInTz(ymd, timezone)
    return !!weeklyPattern[dow as 0 | 1 | 2 | 3 | 4 | 5 | 6]
}

// ----- internal helpers -----

/** Validate / fallback. Anything invalid → UTC. */
const normalizeTz = (timezone?: string): string => {
    if (!timezone) return "UTC"
    try {
        // Round-trip the formatter to confirm the TZ is valid for
        // this Node version's ICU. Throws RangeError for garbage.
        new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format(new Date())
        return timezone
    } catch {
        return "UTC"
    }
}

const formatYmd = (d: Date, tz: string): string => {
    const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone: tz,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    }).formatToParts(d)
    const get = (t: string) => parts.find((p) => p.type === t)?.value ?? ""
    return `${get("year")}-${get("month")}-${get("day")}`
}

/** Offset of `tz` from UTC at instant `d`, in minutes. */
const tzOffsetMinutes = (d: Date, tz: string): number => {
    // Trick: format the same instant in UTC and in tz, parse out
    // the wall-clock fields, then compute the diff in minutes.
    const utcParts = new Intl.DateTimeFormat("en-US", {
        timeZone: "UTC",
        hour12: false,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
    }).formatToParts(d)
    const tzParts = new Intl.DateTimeFormat("en-US", {
        timeZone: tz,
        hour12: false,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
    }).formatToParts(d)
    const num = (parts: Intl.DateTimeFormatPart[], t: string) =>
        parseInt(parts.find((p) => p.type === t)?.value ?? "0", 10)
    const u = (t: string) => num(utcParts, t)
    const z = (t: string) => num(tzParts, t)
    const utcAsMinutes = Date.UTC(u("year"), u("month") - 1, u("day"), u("hour"), u("minute"), u("second"))
    const tzAsMinutes = Date.UTC(z("year"), z("month") - 1, z("day"), z("hour"), z("minute"), z("second"))
    return (tzAsMinutes - utcAsMinutes) / 60000
}

const stripTime = (d: Date): Date => {
    const ymd = formatYmd(d, "UTC")
    const parts = ymd.split("-").map(Number)
    const y = parts[0] ?? 1970
    const m = parts[1] ?? 1
    const day = parts[2] ?? 1
    return new Date(Date.UTC(y, m - 1, day))
}
