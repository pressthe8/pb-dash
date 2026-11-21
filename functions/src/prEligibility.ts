import { Concept2Result } from './types';

export interface PRMatchTarget {
  sport: string;
  metric_type: 'time' | 'distance';
  target_distance?: number | null;
  target_time?: number | null;
}

export function matchesPRType(result: Concept2Result, target: PRMatchTarget): boolean {
  if (result.type !== target.sport) return false;

  // Concept2 separates continuous splits from workouts with explicit work and rest intervals.
  if ((typeof result.workout_type === 'string' && /interval/i.test(result.workout_type)) ||
      (result.rest_time ?? 0) > 0 || (result.rest_distance ?? 0) > 0 ||
      (Array.isArray(result.workout?.intervals) && result.workout.intervals.length > 0)) {
    return false;
  }

  return (target.metric_type === 'time' && result.distance === target.target_distance) ||
    (target.metric_type === 'distance' && result.time === target.target_time);
}
