// Concept2's date is the workout's recorded local time. Read its calendar fields
// directly so offsets and the device's time zone cannot move the workout to another day.
export function workoutCalendar(value: unknown) {
  if (typeof value !== 'string') return null;
  const date = /^(\d{4}-\d{2}-\d{2})(?=$|[ T])(?:[ T](\d{2}:\d{2})(?::(\d{2}))?(?:\.(\d{1,3})\d*)?)?/.exec(value);
  if (!date) return null;

  const [, day, clock = '00:00', seconds = '00', fraction = ''] = date;
  const midnight = new Date(`${day}T00:00:00Z`);
  if (!Number.isFinite(midnight.getTime()) || midnight.toISOString().slice(0, 10) !== day) return null;

  const year = day.slice(0, 4);
  const season = String(seasonEndYear(Number(year), Number(day.slice(5, 7))));
  return { day, year, season, sortKey: `${day}T${clock}:${seconds}.${fraction.padEnd(3, '0')}` };
}

export function seasonEndYear(year: number, month: number): number {
  return month >= 5 ? year + 1 : year;
}

export function formatWorkoutDate(
  value: unknown,
  locale: string | undefined = 'en-US',
  options: Intl.DateTimeFormatOptions = { year: 'numeric', month: 'short', day: 'numeric' },
): string {
  const calendar = workoutCalendar(value);
  // Format a date-only value at midnight UTC to preserve the recorded day.
  return calendar
    ? new Date(`${calendar.day}T00:00:00Z`).toLocaleDateString(locale, { ...options, timeZone: 'UTC' })
    : '–';
}
