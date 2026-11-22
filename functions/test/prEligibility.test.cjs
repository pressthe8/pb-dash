const assert = require('node:assert/strict');
const test = require('node:test');
const { matchesPRType } = require('../lib/prEligibility');

const workout = { type: 'rower', workout_type: 'FixedDistanceSplits', distance: 2000, time: 4200 };
const twoK = { sport: 'rower', metric_type: 'time', target_distance: 2000 };
const sevenMinutes = { sport: 'rower', metric_type: 'distance', target_time: 4200 };

test('continuous splits and legacy entries can match exact distances or durations', () => {
  assert.equal(matchesPRType(workout, twoK), true);
  assert.equal(matchesPRType({ ...workout, workout_type: 'FixedTimeSplits' }, sevenMinutes), true);
  assert.equal(matchesPRType({ ...workout, workout_type: 'unknown' }, twoK), true);
  assert.equal(matchesPRType({ ...workout, workout_type: 'JustRow', distance: 2001 }, twoK), false);
  assert.equal(matchesPRType(workout, { ...sevenMinutes, target_time: 4201 }), false);
  assert.equal(matchesPRType({ ...workout, type: 'skierg' }, twoK), false);
});

test('documented interval types never qualify on aggregate distance or time', () => {
  for (const type of ['FixedDistanceInterval', 'FixedTimeInterval', 'FixedCalorieInterval',
    'FixedWattMinuteInterval', 'VariableInterval', 'VariableIntervalUndefinedRest']) {
    const interval = { ...workout, workout_type: type, rest_time: 0, rest_distance: 0 };
    assert.equal(matchesPRType(interval, twoK), false, type);
    assert.equal(matchesPRType(interval, sevenMinutes), false, type);
  }
});

test('recorded intervals or rest exclude legacy entries even without a workout type', () => {
  for (const evidence of [{ rest_time: 200 }, { rest_distance: 10 }, { workout: { intervals: [{ time: 2100 }] } }]) {
    assert.equal(matchesPRType({ ...workout, workout_type: 'unknown', ...evidence }, twoK), false);
  }
});
