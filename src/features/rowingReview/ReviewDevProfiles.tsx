import { useMemo, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { reviewWindow, summarizeReview, type ReviewSummary, type ReviewWorkout } from './reviewData';

interface Fixture {
  id: string;
  name: string;
  current: () => ReviewWorkout[];
  prior?: () => ReviewWorkout[];
  date?: string;
}

const workout = (date: string, distance: number, time: number): ReviewWorkout => ({ date, type: 'rower', distance, time });
const dated = (year: number, rows: readonly [string, number, number][]) =>
  rows.map(([day, distance, time]) => workout(year + '-' + day, distance, time));

function busyYear(year: number, days: number) {
  const workouts: ReviewWorkout[] = [];
  for (let i = 0; i < days; i++) {
    if (i % 13 === 0) continue;
    const date = new Date(Date.UTC(year, 0, i + 1)).toISOString().slice(0, 10);
    for (let block = 0; block < 1 + Number(i % 5 === 0); block++) {
      const meters = 3500 + (i * 811 + block * 1297) % 3800;
      workouts.push(workout(date, meters, Math.round(meters * (2.3 + block * .04))));
    }
  }
  return workouts;
}

const fixtures: readonly Fixture[] = [
  { id: 'no-rows', name: 'No rows yet', current: () => [] },
  { id: 'one-short-row', name: 'One short untimed row', current: () => dated(2026, [['02-09', 350, 0]]) },
  {
    id: 'weekend-rower', name: 'Weekend rower',
    current: () => dated(2026, [
      ['01-11', 8900, 21810], ['02-15', 10000, 24600], ['04-12', 12400, 32000],
      ['05-10', 5000, 12200], ['05-10', 1700, 0], ['07-05', 9600, 23900],
    ]),
    prior: () => dated(2025, [['02-16', 6000, 16000], ['10-19', 9000, 21800]]),
  },
  {
    id: 'daily-double', name: 'Daily double',
    current: () => busyYear(2026, 285),
    prior: () => busyYear(2025, 365),
  },
  {
    id: 'full-years', name: 'Two full years, nearly tied', date: '2026-12-31',
    current: () => dated(2026, [['01-02', 45000, 115000], ['08-24', 55000, 139000], ['12-30', 55060, 140000]]),
    prior: () => dated(2025, [['01-14', 30000, 81000], ['06-13', 47000, 123000], ['12-13', 78000, 201000]]),
  },
  {
    id: 'annual-totals', name: 'Prior-year totals only',
    current: () => dated(2026, [['01-24', 8500, 21000], ['04-02', 22200, 59200], ['07-04', 45000, 114000]]),
    prior: () => dated(2025, [['07-03', 1200, 3000]]),
  },
  {
    id: 'late-starter', name: 'Late start in the previous year',
    current: () => dated(2026, [['01-30', 10000, 28000]]),
    prior: () => dated(2025, [['12-23', 12700, 30200]]),
  },
];

interface Sample {
  name: string;
  review: ReviewSummary;
}

export default function ReviewDevProfiles({ render }: { render: (controls: ReactNode, sample: Sample | null) => ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();
  const params = new URLSearchParams(location.search);
  const selected = fixtures.find(fixture => fixture.id === params.get('sample'));
  const sample = useMemo(() => {
    if (!selected) return null;
    const window = reviewWindow(selected.date ? new Date(selected.date + 'T12:00:00') : new Date());
    const review = summarizeReview([...selected.current(), ...(selected.prior?.() ?? [])], window);
    return { name: selected.name, review };
  }, [selected]);

  const controls = (
    <label className="profile-picker">
      <span>Review data</span>
      <select value={selected?.id ?? ''} onChange={event => {
        if (event.target.value) params.set('sample', event.target.value);
        else params.delete('sample');
        navigate({ pathname: location.pathname, search: params.toString(), hash: location.hash }, { replace: true });
      }}>
        <option value="">My rowing data</option>
        <optgroup label="Dummy users">
          {fixtures.map(fixture => <option key={fixture.id} value={fixture.id}>{fixture.name}</option>)}
        </optgroup>
      </select>
    </label>
  );
  return render(controls, sample);
}
