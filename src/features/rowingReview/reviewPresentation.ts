import { REVIEW_YEAR } from './reviewConfig';
import { DAYS_IN_REVIEW, type ReviewSummary } from './reviewData';

export const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const numberFormat = new Intl.NumberFormat('en-GB');
const kmFormat = new Intl.NumberFormat('en-GB', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const dateFormat = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });

export const clamp = (value: number) => Math.max(0, Math.min(1, value));
export const ease = (value: number) => 1 - (1 - clamp(value)) ** 3;
export const number = (value: number) => numberFormat.format(value);
export const wholeKm = (meters: number) => number(Math.floor(meters / 1000));
export const annualDistance = (meters: number) => meters < 1000 ? number(Math.floor(meters)) + ' m' : wholeKm(meters) + ' km';
export const measuredDistance = (meters: number) => meters < 1000
  ? number(Math.round(meters)) + ' m'
  : kmFormat.format(meters / 1000) + ' km';
export const formatDay = (day: string) => dateFormat.format(new Date(day + 'T00:00:00Z'));
export const calendarRange = (day: string | null) => !day || day.endsWith('-01-01') ? '1 Jan' : '1 Jan–' + formatDay(day);
export const fullRange = '1 Jan–31 Dec ' + REVIEW_YEAR;
export const throughLabel = (review: ReviewSummary) => review.window.through ? formatDay(review.window.through) : '';
export const yearComplete = (review: ReviewSummary) => review.window.daysElapsed === DAYS_IN_REVIEW;
export const pad = (value: number) => String(value).padStart(2, '0');

export function elapsedTime(seconds: number) {
  if (seconds < 60) return seconds + 's';
  if (seconds < 3600) return Math.floor(seconds / 60) + 'm';
  return Math.floor(seconds / 3600) + 'h ' + pad(Math.floor(seconds / 60) % 60) + 'm';
}

export function rowTime(tenths: number) {
  const seconds = Math.floor(tenths / 10);
  return [Math.floor(seconds / 3600), Math.floor(seconds / 60) % 60, seconds % 60].map(pad).join(':');
}

export function pace(tenths: number) {
  return Math.floor(tenths / 600) + ':' + ((tenths % 600) / 10).toFixed(1).padStart(4, '0');
}

export function axisStep(maximum: number, target: number) {
  const raw = Math.max(1, maximum / target);
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  return magnitude * ([1, 2, 5, 10].find(factor => factor * magnitude >= raw) ?? 10);
}

export const axisLabel = (meters: number, useKm: boolean) => useKm ? number(meters / 1000) + ' km' : number(meters) + ' m';

export type ChapterId = 'rhythm' | 'distance' | 'longest' | 'time' | 'compare' | 'overview';
export interface Chapter {
  id: ChapterId;
  label: string;
  duration: number;
}

export function hasImprovement(review: ReviewSummary) {
  return !!review.prior && review.meters > review.prior.meters &&
    annualDistance(review.meters) !== annualDistance(review.prior.meters);
}

export function reviewChapters(review: ReviewSummary): Chapter[] {
  const chapters: Chapter[] = [
    { id: 'rhythm', label: 'Rhythm', duration: 7000 },
    { id: 'distance', label: 'Distance', duration: 6600 },
  ];
  if (review.longest && review.longest.meters * review.sessions > review.meters) {
    chapters.push({ id: 'longest', label: 'Longest', duration: 6400 });
  }
  if (review.tenths >= 10) chapters.push({ id: 'time', label: 'Time', duration: 6800 });
  if (review.prior) chapters.push({ id: 'compare', label: 'Compare', duration: hasImprovement(review) ? 8400 : 6600 });
  chapters.push({ id: 'overview', label: 'Overview', duration: 8000 });
  return chapters;
}

export const SECONDS_PER_LAP = 24 * 3600;
export function lapLayout(tenths: number) {
  const seconds = Math.floor(tenths / 10);
  const full = Math.floor(seconds / SECONDS_PER_LAP);
  const partial = seconds % SECONDS_PER_LAP;
  const drawnFull = Math.min(full, 5 - Number(partial > 0));
  return { seconds, full, partial, drawnFull, overflow: full - drawnFull, visible: drawnFull + Number(partial > 0) };
}

export function overviewStats(review: ReviewSummary): { label: string; value: string }[] {
  const stats = [
    { label: review.sessions === 1 ? 'Session' : 'Sessions', value: number(review.sessions) },
    { label: review.activeDays === 1 ? 'Rowing day' : 'Rowing days', value: number(review.activeDays) },
  ];
  if (review.tenths >= 10) stats.push({ label: 'Time rowing', value: elapsedTime(Math.floor(review.tenths / 10)) });
  if (review.longest && review.sessions > 1) stats.push({ label: 'Longest row', value: measuredDistance(review.longest.meters) });
  if (review.splitTenths) stats.push({ label: 'Avg / 500 m', value: pace(review.splitTenths) });
  return stats;
}
