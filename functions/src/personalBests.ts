import { calculatePaceFor500m } from './paceCalculation';
import { matchesPRType, PRMatchTarget } from './prEligibility';
import { Concept2Result } from './types';
import { workoutCalendar } from './workoutCalendar';
import { normalizeWorkoutSport } from './workoutSport';

export interface PRType extends PRMatchTarget {
  activity_key: string;
  is_active?: boolean;
}

export interface PRAttempt {
  user_id: string;
  results_id: string;
  activity_key: string;
  sport: string;
  pr_scope: string[];
  metric_type: PRType['metric_type'];
  metric_value: number;
  achieved_at: string;
  season_identifier: string;
  previous_record: number | null;
  pace_per_500m: number | null;
}

export function buildPRAttempts(uid: string, workouts: Concept2Result[], types: PRType[]): Map<string, PRAttempt> {
  const active = types.filter(type => type.is_active && type.activity_key &&
    (type.metric_type === 'time' || type.metric_type === 'distance'));
  const attempts = new Map<string, PRAttempt>();

  for (const workout of workouts) {
    const calendar = workoutCalendar(workout.date);
    if (!calendar) continue;
    const matches = active.filter(type => matchesPRType(workout, type));
    if (matches.length === 0) continue;

    const sport = normalizeWorkoutSport(workout.type);
    const pace = calculatePaceFor500m(workout.time, workout.distance);
    for (const type of matches) {
      attempts.set(workout.id + '_' + type.activity_key, {
        user_id: uid,
        results_id: String(workout.id),
        activity_key: type.activity_key,
        sport,
        pr_scope: [],
        metric_type: type.metric_type,
        metric_value: type.metric_type === 'time' ? workout.time : workout.distance,
        achieved_at: workout.date,
        season_identifier: calendar.season,
        previous_record: null,
        pace_per_500m: pace,
      });
    }
  }

  return attempts;
}

interface ScopedAttempt {
  id: string;
  attempt: PRAttempt;
  sortKey: string;
  season: string;
  scopes: string[];
}

export function calculatePRScopes(attempts: ReadonlyMap<string, PRAttempt>) {
  const byActivity = new Map<string, ScopedAttempt[]>();
  for (const [id, attempt] of attempts) {
    const calendar = workoutCalendar(attempt.achieved_at);
    if (!calendar) continue;

    const entry = {
      id, attempt, sortKey: calendar.sortKey, season: calendar.season,
      scopes: ['all-time', 'season-' + calendar.season, 'year-' + calendar.year],
    };
    const activity = byActivity.get(attempt.activity_key);
    if (activity) activity.push(entry);
    else byActivity.set(attempt.activity_key, [entry]);
  }

  const updates = new Map<string, Pick<PRAttempt, 'pr_scope' | 'season_identifier'>>();
  for (const activity of byActivity.values()) {
    activity.sort((a, b) => a.sortKey.localeCompare(b.sortKey) ||
      Number(a.attempt.results_id) - Number(b.attempt.results_id));
    const lowerIsBetter = activity[0].attempt.metric_type === 'time';
    const bestByScope = new Map<string, ScopedAttempt>();
    for (const entry of activity) {
      for (const scope of entry.scopes) {
        const previous = bestByScope.get(scope);
        const value = entry.attempt.metric_value;
        if (!previous || (lowerIsBetter
          ? value < previous.attempt.metric_value
          : value > previous.attempt.metric_value)) bestByScope.set(scope, entry);
      }
    }

    for (const entry of activity) {
      updates.set(entry.id, {
        pr_scope: entry.scopes.filter(scope => bestByScope.get(scope) === entry),
        season_identifier: entry.season,
      });
    }
  }
  return updates;
}
