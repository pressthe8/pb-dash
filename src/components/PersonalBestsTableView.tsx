import { lazy, Suspense, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ArrowUpRight, ChevronDown, Clock3, Target, Trophy } from 'lucide-react';
import { type PRStats, type PREvent, type SportType, SPORT_MAPPING } from '../types/personalRecords';
import { formatTime } from '../utils/timeFormatting';
import { formatWorkoutDate, workoutCalendar } from '../../functions/src/workoutCalendar';

const PRProgressionChart = lazy(() => import('./PRProgressionChart').then(module => ({ default: module.PRProgressionChart })));

interface PersonalBestsTableViewProps {
  prStats: PRStats[];
  loading: boolean;
  allPREvents: PREvent[];
  selectedSport?: SportType;
  seasonView?: boolean;
}

type SortField = 'date' | 'performance';

function formatPeriod(period: string) {
  if (period === 'all-time') return 'All time';
  const [kind, year] = period.split('-');
  return kind === 'season' ? `${Number(year) - 1}/${year.slice(-2)}` : year;
}

function formatRecord(event: PREvent) {
  return event.metric_type === 'time' ? formatTime(event.metric_value) : event.metric_value.toLocaleString() + ' m';
}

function RecordHistory({ stat, events, seasonView, onBack }: { stat: PRStats; events: PREvent[]; seasonView: boolean; onBack: () => void }) {
  const title = useRef<HTMLHeadingElement>(null);
  useLayoutEffect(() => { title.current?.focus(); }, []);
  const [sort, setSort] = useState<{ field: SortField; ascending: boolean }>({ field: 'date', ascending: false });
  const measuresDistance = events[0]?.metric_type === 'distance';
  const sorted = useMemo(() => [...events].sort((a, b) => {
    const order = sort.field === 'date'
      ? (workoutCalendar(a.achieved_at)?.sortKey ?? '').localeCompare(workoutCalendar(b.achieved_at)?.sortKey ?? '')
      : a.metric_value - b.metric_value;
    return sort.ascending ? order : -order;
  }), [events, sort]);

  function sortBy(field: SortField) {
    setSort(previous => ({
      field,
      ascending: previous.field === field ? !previous.ascending : field === 'performance' && !measuresDistance,
    }));
  }

  return (
    <section className="pb-panel pb-records" aria-labelledby="pb-event-title">
      <header className="pb-records-header">
        <div>
          <button type="button" className="pb-text-button pb-back" onClick={onBack}><ArrowLeft size={16} aria-hidden="true" /> Personal bests</button>
          <h2 id="pb-event-title" tabIndex={-1} ref={title}>{stat.activity_name}</h2>
        </div>
        <span className="pb-label">{events.length} {events.length === 1 ? 'record' : 'records'}</span>
      </header>
      <div className="pb-record-chart">
        <h3>Pace progression</h3>
        <p><span className="pb-legend-dot pb-legend-pb" /> All-time PB <span className="pb-legend-dot" /> Other personal records</p>
        <Suspense fallback={<p className="pb-chart-loading" role="status">Loading pace history…</p>}>
          <PRProgressionChart events={events} seasonView={seasonView} />
        </Suspense>
      </div>
      <div className="pb-result-scroll">
        <table className="pb-table">
          <thead>
            <tr>
              <th scope="col" aria-sort={sort.field === 'date' ? sort.ascending ? 'ascending' : 'descending' : undefined}>
                <button type="button" onClick={() => sortBy('date')}>Date {sort.field === 'date' && (sort.ascending ? '↑' : '↓')}</button>
              </th>
              <th scope="col" aria-sort={sort.field === 'performance' ? sort.ascending ? 'ascending' : 'descending' : undefined}>
                <button type="button" onClick={() => sortBy('performance')}>
                  {measuresDistance ? 'Distance' : 'Time'} {sort.field === 'performance' && (sort.ascending ? '↑' : '↓')}
                </button>
              </th>
              <th scope="col">Pace / 500m</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map(event => (
              <tr key={event.id}>
                <td>{formatWorkoutDate(event.achieved_at)}</td>
                <td className="pb-record-value">
                  {formatRecord(event)}
                  {event.pr_scope.includes('all-time') && <Trophy size={14} aria-label="All-time personal best" />}
                </td>
                <td>{event.pace_per_500m ? formatTime(event.pace_per_500m) : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function PersonalBestsTableView({ prStats, loading, allPREvents, selectedSport, seasonView }: PersonalBestsTableViewProps) {
  const [periodChoice, setPeriodChoice] = useState('all-time');
  const [activityKey, setActivityKey] = useState<string | null>(null);
  const historyTrigger = useRef<HTMLButtonElement>(null);
  const lastOpenedActivity = useRef<string | null>(null);
  useLayoutEffect(() => {
    if (!activityKey && lastOpenedActivity.current) {
      historyTrigger.current?.focus();
      lastOpenedActivity.current = null;
    }
  }, [activityKey]);
  const bySeason = seasonView ?? (localStorage.getItem('pr_view_mode') === 'season');

  const periods = useMemo(() => {
    const available = new Set<string>();
    for (const event of allPREvents) {
      const calendar = workoutCalendar(event.achieved_at);
      if (calendar) available.add(bySeason ? 'season-' + calendar.season : 'year-' + calendar.year);
    }
    return ['all-time', ...Array.from(available).sort().reverse()];
  }, [allPREvents, bySeason]);

  const period = periods.includes(periodChoice) ? periodChoice : 'all-time';
  const records = prStats.flatMap(stat => {
    const record = period === 'all-time' ? stat.all_time_record : allPREvents.find(event => {
      if (event.activity_key !== stat.activity_key || !event.pr_scope.includes(period)) return false;
      const calendar = workoutCalendar(event.achieved_at);
      return Boolean(calendar && period === (bySeason ? 'season-' + calendar.season : 'year-' + calendar.year));
    });
    return record ? [{ stat, record }] : [];
  });
  const active = prStats.find(stat => stat.activity_key === activityKey);

  if (active) {
    return <RecordHistory stat={active} events={allPREvents.filter(event => event.activity_key === activityKey)}
      seasonView={bySeason} onBack={() => setActivityKey(null)} />;
  }

  return (
    <section className="pb-panel pb-records" aria-labelledby="pb-records-title" aria-busy={loading}>
      <header className="pb-records-header">
        <div>
          <h2 id="pb-records-title">Personal bests</h2>
          {!loading && records.length > 0 && <p>{records.length} {records.length === 1 ? 'event' : 'events'}{selectedSport && ' · ' + SPORT_MAPPING[selectedSport]}</p>}
        </div>
        {periods.length > 1 && (
          <div className="pb-select">
            <select aria-label="Record period" value={period} onChange={event => setPeriodChoice(event.target.value)}>
              {periods.map(value => <option key={value} value={value}>{formatPeriod(value)}</option>)}
            </select>
            <ChevronDown size={16} aria-hidden="true" />
          </div>
        )}
      </header>
      {loading ? (
        <p className="pb-records-empty" role="status">Loading personal bests…</p>
      ) : records.length === 0 ? (
        <p className="pb-records-empty">{period === 'all-time' ? 'No personal bests for this machine yet.' : 'No personal bests for this period.'}</p>
      ) : (
        <table className="pb-table">
          <thead><tr><th scope="col">Event</th><th scope="col">Best</th><th scope="col">Date</th></tr></thead>
          <tbody>
            {records.map(({ stat, record }) => {
              const Icon = record.metric_type === 'time' ? Target : Clock3;
              return (
                <tr key={stat.activity_key}>
                  <th scope="row">
                    <button className="pb-record-event" type="button"
                      ref={stat.activity_key === lastOpenedActivity.current ? historyTrigger : undefined}
                      onClick={() => {
                        lastOpenedActivity.current = stat.activity_key;
                        setActivityKey(stat.activity_key);
                      }}>
                      <span className="pb-record-icon"><Icon size={16} aria-hidden="true" /></span>
                      {stat.activity_name}
                      <ArrowUpRight className="pb-record-arrow" size={15} aria-hidden="true" />
                    </button>
                  </th>
                  <td className="pb-record-value">
                    {formatRecord(record)}
                    {stat.all_time_record?.id === record.id && <Trophy size={14} aria-label="All-time personal best" />}
                  </td>
                  <td>{formatWorkoutDate(record.achieved_at)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </section>
  );
}
