const assert = require('node:assert/strict');
const test = require('node:test');
const { buildPRAttempts, calculatePRScopes } = require('../lib/personalBests');
const { asErgSport } = require('../lib/workoutSport');

const twoKRow = {
  activity_key: '2k_row', sport: 'rower', metric_type: 'time', target_distance: 2000, is_active: true,
};
const eightMinutes = {
  activity_key: '8min_row', sport: 'rower', metric_type: 'distance', target_time: 4800, is_active: true,
};

function workout(id, date, time, distance = 2000, type = 'rower') {
  return { id, date, time, distance, type, workout_type: 'FixedDistanceSplits' };
}

test('attempts match configured activities and accept both BikeErg spellings', () => {
  const bike = { ...twoKRow, activity_key: '2k_bike', sport: 'bike' };
  const date = '2026-01-01 00:01:00';
  const workouts = [
    workout(1, date, 4800),
    workout(2, date, 4100, 2000, 'bike'),
    workout(3, date, 4000, 2000, 'bikeerg'),
    { ...workout(4, date, 3900), rest_time: 60 },
    workout(5, date, 4600, 2100),
  ];
  const attempts = buildPRAttempts('user', workouts, [twoKRow, eightMinutes, bike]);
  assert.deepEqual([...attempts.keys()], ['1_2k_row', '1_8min_row', '2_2k_bike', '3_2k_bike']);
  assert.equal(attempts.get('3_2k_bike').sport, 'bike');
  assert.equal(asErgSport('bikeerg'), 'bike');
  assert.equal(asErgSport('bike'), 'bike');
  assert.equal(asErgSport('water'), undefined);
});

test('scope ranking keeps activities separate, favours earlier ties, and uses recorded calendar periods', () => {
  const attempts = buildPRAttempts('user', [
    workout(10, '2026-05-01T00:01:00+12:00', 4000),
    workout(2, '2026-05-01 00:01:00', 4000),
    workout(3, '2025-12-31T23:59:00-10:00', 4500),
    workout(4, '2026-04-30T23:59:00-10:00', 4300),
    workout(5, '2026-06-01 12:00:00', 4800, 2100),
    workout(6, '2026-07-01 12:00:00', 4800, 2200),
  ], [twoKRow, eightMinutes]);
  const scopes = calculatePRScopes(attempts);

  assert.deepEqual(scopes.get('2_2k_row').pr_scope, ['all-time', 'season-2027', 'year-2026']);
  assert.deepEqual(scopes.get('10_2k_row').pr_scope, []);
  assert.deepEqual(scopes.get('3_2k_row').pr_scope, ['year-2025']);
  assert.deepEqual(scopes.get('4_2k_row').pr_scope, ['season-2026']);
  assert.deepEqual(scopes.get('5_8min_row').pr_scope, []);
  assert.deepEqual(scopes.get('6_8min_row').pr_scope, ['all-time', 'season-2027', 'year-2026']);
});
