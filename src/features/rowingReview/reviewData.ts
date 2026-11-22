import { workoutCalendar } from '../../../functions/src/workoutCalendar';
import { asErgSport } from '../../../functions/src/workoutSport';
import { calculatePaceFor500m } from '../../../functions/src/paceCalculation';
import { REVIEW_YEAR } from './reviewConfig';

export const REVIEW_START = '2025-01-01';
const DAY_MS = 86400000;
const yearStart = Date.UTC(REVIEW_YEAR, 0, 1);
const nextYear = Date.UTC(REVIEW_YEAR + 1, 0, 1);
export const DAYS_IN_REVIEW = (nextYear - yearStart) / DAY_MS;

export const firstDayOfMonth = (month: number) => (Date.UTC(REVIEW_YEAR, month, 1) - yearStart) / DAY_MS;

export interface ReviewWindow {
  through: string | null;
  endExclusive: string;
  daysElapsed: number;
}

export function reviewWindow(now = new Date()): ReviewWindow {
  // Compare calendar dates in the browser's time zone. UTC is used for date arithmetic only.
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  const end = Math.max(yearStart, Math.min(nextYear, today + DAY_MS));
  return {
    through: end > yearStart ? new Date(end - DAY_MS).toISOString().slice(0, 10) : null,
    endExclusive: new Date(end).toISOString().slice(0, 10),
    daysElapsed: (end - yearStart) / DAY_MS,
  };
}

export interface ReviewWorkout {
  date?: unknown;
  type?: unknown;
  distance?: unknown;
  time?: unknown;
}

export interface YearTotals {
  meters: number;
  sessions: number;
  activeDays: number;
}

export interface LongestRow {
  day: string;
  meters: number;
  tenths: number;
}

export interface ReviewSummary extends YearTotals {
  window: ReviewWindow;
  daily: number[];
  cumulative: number[];
  daysRowed: number[];
  dayPeak: number;
  months: { meters: number; sessions: number }[];
  tenths: number;
  timedMeters: number;
  splitTenths: number | null;
  longest: LongestRow | null;
  prior: YearTotals | null;
}

export function summarizeReview(workouts: readonly ReviewWorkout[], window: ReviewWindow): ReviewSummary {
  const daily = Array<number>(window.daysElapsed).fill(0);
  const months = Array.from({ length: 12 }, () => ({ meters: 0, sessions: 0 }));
  const priorDays = new Set<string>();
  let priorMeters = 0;
  let priorSessions = 0;
  let sessions = 0;
  let tenths = 0;
  let timedMeters = 0;
  let longest: LongestRow | null = null;
  let longestSortKey = '';

  for (const workout of workouts) {
    const { date, type, distance, time } = workout;
    if (typeof type !== 'string' || asErgSport(type) !== 'rower' ||
        typeof distance !== 'number' || !Number.isFinite(distance) || distance <= 0) continue;
    const calendar = workoutCalendar(date);
    if (!calendar || calendar.day < REVIEW_START || calendar.day >= window.endExclusive) continue;

    if (calendar.year === String(REVIEW_YEAR - 1)) {
      priorMeters += distance;
      priorSessions++;
      priorDays.add(calendar.day);
      continue;
    }

    const day = (Date.parse(calendar.day + 'T00:00:00Z') - yearStart) / DAY_MS;
    const month = months[Number(calendar.day.slice(5, 7)) - 1];
    daily[day] += distance;
    month.meters += distance;
    month.sessions++;
    sessions++;

    const duration = typeof time === 'number' && Number.isFinite(time) && time > 0 ? time : 0;
    if (duration > 0) {
      timedMeters += distance;
      tenths += duration;
    }
    if (!longest || distance > longest.meters ||
        (distance === longest.meters && calendar.sortKey < longestSortKey)) {
      longest = { day: calendar.day, meters: distance, tenths: duration };
      longestSortKey = calendar.sortKey;
    }
  }

  const cumulative = [0];
  const daysRowed = [0];
  let meters = 0;
  let activeDays = 0;
  let dayPeak = 1;
  for (const distance of daily) {
    meters += distance;
    activeDays += Number(distance > 0);
    dayPeak = Math.max(dayPeak, distance);
    cumulative.push(meters);
    daysRowed.push(activeDays);
  }

  return {
    window, daily, cumulative, daysRowed, dayPeak, months,
    meters, sessions, activeDays, tenths, timedMeters, longest,
    splitTenths: calculatePaceFor500m(tenths, timedMeters),
    prior: priorSessions ? { meters: priorMeters, sessions: priorSessions, activeDays: priorDays.size } : null,
  };
}
