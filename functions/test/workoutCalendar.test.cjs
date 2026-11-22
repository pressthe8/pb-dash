const assert = require('node:assert/strict');
const test = require('node:test');
const { formatWorkoutDate, workoutCalendar } = require('../lib/workoutCalendar');
const { needsPRRebuild, PR_CALCULATION_VERSION } = require('../lib/workoutSyncLock');

test('recorded workout days determine seasons and years across time zones', t => {
  const priorTimeZone = process.env.TZ;
  t.after(() => {
    if (priorTimeZone === undefined) delete process.env.TZ;
    else process.env.TZ = priorTimeZone;
  });

  const boundaries = [
    ['2025-12-31 23:59:00', '2025-12-31', '2025', '2026', 'Dec 31, 2025'],
    ['2026-01-01T00:01:00+13:00', '2026-01-01', '2026', '2026', 'Jan 1, 2026'],
    ['2026-04-30T23:59:00-10:00', '2026-04-30', '2026', '2026', 'Apr 30, 2026'],
    ['2026-05-01 00:01:00', '2026-05-01', '2026', '2027', 'May 1, 2026'],
  ];

  for (const zone of ['America/Los_Angeles', 'Europe/London', 'Pacific/Auckland']) {
    process.env.TZ = zone;
    for (const [input, day, year, season, label] of boundaries) {
      const result = workoutCalendar(input);
      assert.deepEqual([result.day, result.year, result.season], [day, year, season], zone);
      assert.equal(formatWorkoutDate(input), label, zone);
    }
    assert.equal(formatWorkoutDate('2026-05-01', 'en-GB', {
      day: '2-digit', month: '2-digit', year: '2-digit',
    }), '01/05/26', zone);
  }
});

test('legacy dates sort by recorded clock time and invalid calendar days have no period', () => {
  const entries = [
    '2026-05-01T01:00:00.250+12:00',
    '2026-05-01T01:00:00.125Z',
    '2026-05-01 00:45:00',
    '2026-04-30T23:59:30-10:00',
    '2026-05-01',
  ];
  const sorted = [...entries].sort((a, b) => workoutCalendar(a).sortKey.localeCompare(workoutCalendar(b).sortKey));
  assert.deepEqual(sorted, [entries[3], entries[4], entries[2], entries[1], entries[0]]);
  assert.equal(workoutCalendar('2024-02-29').day, '2024-02-29');
  assert.equal(workoutCalendar('2026-02-29'), null);
  assert.equal(workoutCalendar(null), null);
  assert.equal(formatWorkoutDate('bad date'), '–');
});

test('the next sync repairs previously calculated PR scopes', () => {
  assert.equal(needsPRRebuild({ prEligibilityVersion: 1 }), true);
  assert.equal(needsPRRebuild({ prEligibilityVersion: PR_CALCULATION_VERSION }), false);
  assert.equal(needsPRRebuild({ prEligibilityVersion: PR_CALCULATION_VERSION, prAppendStarted: true }), true);
});
