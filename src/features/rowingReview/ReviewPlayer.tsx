import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { FlamingStopwatchLogo } from '../../components/FlamingStopwatchLogo';
import { drawDistance, drawLaps, drawRadar, drawWake, downloadReviewPoster } from './reviewArt';
import { REVIEW_TITLE, REVIEW_YEAR } from './reviewConfig';
import { DAYS_IN_REVIEW, type LongestRow, type ReviewSummary, type YearTotals } from './reviewData';
import {
  MONTHS, SECONDS_PER_LAP, annualDistance, axisStep, calendarRange, clamp, ease, elapsedTime,
  formatDay, fullRange, hasImprovement, lapLayout, measuredDistance, number, overviewStats, pace, pad,
  reviewChapters, rowTime, throughLabel, wholeKm, yearComplete,
} from './reviewPresentation';
import { useReviewPlayback } from './useReviewPlayback';
import './rowingReview.css';

function cssVars(values: Record<string, string | number>): CSSProperties {
  return values as CSSProperties;
}

type DrawFrame = (context: CanvasRenderingContext2D, width: number, height: number) => void;

function Artwork({ draw }: { draw: DrawFrame }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const renderer = useRef(draw);
  const paint = useCallback(() => {
    const element = canvas.current;
    const context = element?.getContext('2d');
    if (!element || !context) return;
    const { width, height } = element.getBoundingClientRect();
    if (width <= 0 || height <= 0) return;
    const scale = Math.min(window.devicePixelRatio || 1, 2);
    const pixelsWide = Math.max(1, Math.round(width * scale));
    const pixelsHigh = Math.max(1, Math.round(height * scale));
    if (element.width !== pixelsWide) element.width = pixelsWide;
    if (element.height !== pixelsHigh) element.height = pixelsHigh;
    context.setTransform(scale, 0, 0, scale, 0, 0);
    context.clearRect(0, 0, width, height);
    renderer.current(context, width, height);
  }, []);

  useLayoutEffect(() => {
    renderer.current = draw;
    paint();
  }, [draw, paint]);

  useEffect(() => {
    if (!canvas.current) return;
    const observer = new ResizeObserver(paint);
    observer.observe(canvas.current);
    return () => observer.disconnect();
  }, [paint]);

  return <canvas ref={canvas} aria-hidden="true" />;
}

export function ReviewFrame({ children, controls, footerActions, sample }: { children: ReactNode; controls?: ReactNode; footerActions?: ReactNode; sample?: boolean }) {
  useEffect(() => {
    const title = document.title;
    document.title = REVIEW_TITLE + ' · PB Dash';
    return () => { document.title = title; };
  }, []);

  return (
    <main className="rowing-review">
      <div className="shell">
        <header className="mast">
          <div className="brand">
            <Link to="/dashboard" aria-label="Back to Dashboard"><FlamingStopwatchLogo className="review-logo" /></Link>
            <div><span className="wordmark">{sample ? 'PB Dash / Sample data' : 'PB Dash'}</span><h1>{REVIEW_TITLE}</h1></div>
          </div>
          {controls && <div className="mast-tools">{controls}</div>}
        </header>
        {children}
        <footer className="review-actions">
          {footerActions}
          <Link to="/dashboard" className="button">Back to Dashboard</Link>
        </footer>
      </div>
    </main>
  );
}

function DistanceCounter({ meters, unit }: { meters: number; unit: 'm' | 'km' }) {
  return <p className="count">{unit === 'm' ? number(Math.floor(meters)) : wholeKm(meters)}<span className="unit">{unit}</span></p>;
}

function Rhythm({ review, cursor, visible }: { review: ReviewSummary; cursor: number; visible: number }) {
  return (
    <>
      <div className="copy">
        <p className="kicker">RowErg · {calendarRange(review.window.through)} {REVIEW_YEAR}</p>
        <h2>You showed up.</h2>
        <p className="count" aria-hidden="true">{pad(review.daysRowed[visible])}</p>
        <p className="metric-label"><span className="nosight">{number(review.activeDays)} </span>{review.activeDays === 1 ? 'Day' : 'Days'} on the erg</p>
        <p className="note">{number(review.sessions)} {review.sessions === 1 ? 'session' : 'sessions'} logged.</p>
      </div>
      <figure className="figure">
        <Artwork draw={(context, width, height) => drawRadar(context, width, height, review, cursor)} />
        <figcaption className="legend">One mark per rowing day · longer marks mean more meters</figcaption>
      </figure>
    </>
  );
}

function Distance({ review, cursor, visible }: { review: ReviewSummary; cursor: number; visible: number }) {
  const peak = review.months.reduce((best, month, index) => month.meters > review.months[best].meters ? index : best, 0);
  return (
    <>
      <div className="copy">
        <p className="kicker">Distance</p>
        <h2>The meters added up.</h2>
        <div aria-hidden="true"><DistanceCounter meters={review.cumulative[visible]} unit={review.meters < 1000 ? 'm' : 'km'} /></div>
        <p className="metric-label"><span className="nosight">{annualDistance(review.meters)} </span>Total distance</p>
        <p className="note">{review.activeDays > 1
          ? `${MONTHS[peak]} was your biggest month at ${measuredDistance(review.months[peak].meters)}.`
          : 'All your meters came on one rowing day.'}</p>
      </div>
      <figure className="figure">
        <Artwork draw={(context, width, height) => drawDistance(context, width, height, review, cursor)} />
        <figcaption className="legend">{REVIEW_YEAR} running total</figcaption>
      </figure>
    </>
  );
}

function Longest({ row, total, progress }: { row: LongestRow; total: number; progress: number }) {
  const filled = ease(progress / .64);
  const step = axisStep(row.meters, 5);
  const ticks = Array.from({ length: Math.floor(row.meters / step) + 1 }, (_, i) => i * step);
  return (
    <>
      <div className="spotlight">
        <div className="copy"><p className="kicker">Longest session</p><h2>One big row.</h2></div>
        <div>
          <p className="count" aria-hidden="true">{number(Math.round(row.meters * filled))}<span className="unit">m</span></p>
          <p className="metric-label"><span className="nosight">{number(row.meters)} meters. </span>Single-session distance</p>
        </div>
      </div>
      <div className="track" aria-hidden="true" style={cssVars({ '--lane-progress': filled, '--lane-position': filled * 100 + '%' })}>
        <div className="lane"><div className="lane-fill" /><div className="lane-shell" /></div>
        <div className="track-ticks">
          {ticks.map(meters => (
            <span key={meters} style={{ left: meters / row.meters * 100 + '%' }}>
              {meters === 0 ? '0' : meters >= 1000 ? number(meters / 1000) + 'k' : number(meters) + ' m'}
            </span>
          ))}
        </div>
      </div>
      <div className="row-facts">
        <p className="metric-label">{formatDay(row.day)} {REVIEW_YEAR}{row.tenths > 0 && ' · ' + rowTime(row.tenths)}</p>
        <p>{(row.meters / total * 100).toFixed(1)}% of all your meters this year, in one session.</p>
      </div>
    </>
  );
}

function Time({ review, progress }: { review: ReviewSummary; progress: number }) {
  const laps = lapLayout(review.tenths);
  const seconds = Math.floor(laps.seconds * clamp(progress / .73));
  return (
    <>
      <div className="copy">
        <p className="kicker">Time and pace</p>
        <h2>{laps.seconds >= SECONDS_PER_LAP * 1.2 && laps.full === 1 ? 'A full day. And then some.' : 'Time on the erg.'}</h2>
        <p className="count" aria-hidden="true">{elapsedTime(seconds)}</p>
        <p className="metric-label"><span className="nosight">{elapsedTime(laps.seconds)}. </span>Total time rowing</p>
        {!!review.splitTenths && <p className="split-detail"><b>{pace(review.splitTenths)}</b><span className="metric-label">Average split per 500 m</span></p>}
      </div>
      <figure className="circuit">
        <Artwork draw={(context, width, height) => drawLaps(context, width, height, laps, seconds)} />
        <div className="laps" aria-hidden="true">
          <div className="lap">
            <b>{laps.full ? number(Math.floor(seconds / SECONDS_PER_LAP)) + ' × 24h' : elapsedTime(seconds)}</b>
            <p className="metric-label">{laps.full ? 'Full laps' : 'Partial lap'}</p>
          </div>
          {laps.full > 0 && laps.partial > 0 && (
            <div className="lap"><b>{elapsedTime(Math.max(0, seconds - laps.full * SECONDS_PER_LAP))}</b><p className="metric-label">Partial lap</p></div>
          )}
        </div>
        <figcaption className="legend">
          One lap represents 24 hours{laps.overflow > 0 && ` · ${number(laps.overflow)} extra ${laps.overflow === 1 ? 'lap' : 'laps'} included in total`}
        </figcaption>
      </figure>
    </>
  );
}

function compareDetails(range: string, totals: YearTotals) {
  return `${range} · ${number(totals.sessions)} ${totals.sessions === 1 ? 'session' : 'sessions'} · ${number(totals.activeDays)} ${totals.activeDays === 1 ? 'day' : 'days'}`;
}

function ComparisonRun({ year, total, base, extra = 0, scale, details }: {
  year: number; total: number; base: number; extra?: number; scale: number; details: string;
}) {
  return (
    <div className={'compare-run' + (year === REVIEW_YEAR ? ' current' : '')}>
      <div className="run-heading"><span className="run-year">{year}</span><strong className="run-value">{annualDistance(total)}</strong></div>
      <div className="run-track" style={cssVars({
        '--meters-fill': base / scale,
        '--gain-start': base / scale * 100 + '%',
        '--gain-fill': extra / scale * 100 + '%',
        '--marker-position': total / scale * 100 + '%',
        '--marker-opacity': Number(total > 0),
      })}>
        <span className="run-fill" />{extra > 0 && <span className="run-gain" />}<span className="run-marker" />
      </div>
      <p className="run-details">{details}</p>
    </div>
  );
}

function Compare({ review, prior, progress }: { review: ReviewSummary; prior: YearTotals; progress: number }) {
  const gain = review.meters - prior.meters;
  const improvement = hasImprovement(review);
  const revealingGain = improvement && progress >= .43;
  const firstPass = ease(progress / (improvement ? .24 : .34));
  const base = (improvement ? prior.meters : review.meters) * firstPass;
  const extra = improvement ? gain * ease((progress - .43) / .30) : 0;
  const maximum = Math.max(review.meters, prior.meters);
  const step = axisStep(maximum, 12) * 2;
  const scale = Math.ceil(maximum / step) * step;
  const priorYear = REVIEW_YEAR - 1;
  const currentDetails = compareDetails(calendarRange(review.window.through), review);
  const priorDetails = compareDetails('1 Jan–31 Dec', prior);
  const beat = revealingGain ? '+' + measuredDistance(gain) : improvement
    ? annualDistance(prior.meters)
    : gain === 0 ? 'Even on distance' : measuredDistance(Math.abs(gain)) + ' apart';
  const explanation = revealingGain ? `${REVIEW_YEAR} beyond the full ${priorYear} total.` : improvement
    ? `${priorYear} full-year distance.` : yearComplete(review)
      ? 'Two full calendar years.'
      : `Full-year ${priorYear} and ${REVIEW_YEAR} through ${throughLabel(review)}.`;

  return (
    <>
      <div className="copy">
        <p className="kicker">Year over year</p><h2>{REVIEW_YEAR} vs. {priorYear}</h2>
        <p className="compare-insight" aria-hidden="true"><strong>{beat}</strong><span>{explanation}</span></p>
        <p className="nosight">{REVIEW_YEAR}, {annualDistance(review.meters)}, {currentDetails}. {priorYear}, {annualDistance(prior.meters)}, {priorDetails}.</p>
      </div>
      <div className="compare-runs" aria-hidden="true">
        <ComparisonRun year={REVIEW_YEAR} total={base + extra} base={base} extra={extra} scale={scale} details={currentDetails} />
        <ComparisonRun year={priorYear} total={prior.meters * firstPass} base={prior.meters * firstPass} scale={scale} details={priorDetails} />
      </div>
    </>
  );
}

function Overview({ review, elapsed }: { review: ReviewSummary; elapsed: number }) {
  return (
    <>
      <Artwork draw={(context, width, height) => drawWake(context, width, height, clamp(elapsed / 7300), window.matchMedia('(max-width: 820px)').matches)} />
      <div className="copy">
        <p className="kicker">RowErg · {fullRange}</p><h2>Your year<br />on the erg.</h2>
        <DistanceCounter meters={review.meters} unit={review.meters < 1000 ? 'm' : 'km'} />
        <p className="metric-label">Total distance</p>
        {!yearComplete(review) && <p className="overview-cutoff">Stats through {throughLabel(review)}</p>}
        <dl className="overview-stats">
          {overviewStats(review).map(({ label, value }) => (
            <div key={label}><dt>{label}</dt><dd>{value}</dd></div>
          ))}
        </dl>
      </div>
    </>
  );
}

export function ReviewPlayer({ review, controls, sample }: { review: ReviewSummary; controls?: ReactNode; sample?: boolean }) {
  const chapters = useMemo(() => reviewChapters(review), [review]);
  const player = useReviewPlayback(chapters);
  const [exporting, setExporting] = useState(false);
  const [exportMessage, setExportMessage] = useState('');
  const { chapter, index, elapsed, playing, jump } = player;
  const progress = clamp(elapsed / chapter.duration);
  const cursor = clamp(progress / .63) * DAYS_IN_REVIEW;
  const visible = Math.min(review.window.daysElapsed, Math.floor(cursor));
  const entry = ease(elapsed / 380);

  async function exportPng() {
    setExporting(true);
    setExportMessage('');
    try {
      await downloadReviewPoster(review);
      setExportMessage('Overview PNG ready · 1080 × 1350');
    } catch {
      setExportMessage('Could not download the overview. Try again.');
    } finally {
      setExporting(false);
    }
  }

  return (
    <ReviewFrame sample={sample} controls={controls} footerActions={
      <>
      <button className="button" type="button" onClick={() => jump(0, true)}>Replay</button>
      <button className="button primary" type="button" disabled={exporting} onClick={exportPng}>{exporting ? 'Preparing image…' : 'Share'}</button>
      </>
    }>
      <nav className="timeline" aria-label="Review chapters" style={cssVars({ '--chapter-count': chapters.length })}>
        {chapters.map((item, i) => (
          <button type="button" className="chapter" key={item.id} aria-current={i === index ? 'step' : undefined}
            style={cssVars({ '--progress': (i < index ? 100 : i === index ? progress * 100 : 0) + '%' })}
            onClick={() => jump(i, playing || item.id === 'overview')}>{item.label}</button>
        ))}
      </nav>
      <section className="stage" data-scene={chapter.id} aria-label="Animated review">
        <article key={chapter.id} className="scene" data-chapter={chapter.id} style={cssVars({ '--entry': entry, '--lift': (1 - entry) * 13 + 'px' })}>
          {chapter.id === 'rhythm' && <Rhythm review={review} cursor={cursor} visible={visible} />}
          {chapter.id === 'distance' && <Distance review={review} cursor={cursor} visible={visible} />}
          {chapter.id === 'longest' && review.longest && <Longest row={review.longest} total={review.meters} progress={progress} />}
          {chapter.id === 'time' && <Time review={review} progress={progress} />}
          {chapter.id === 'compare' && review.prior && <Compare review={review} prior={review.prior} progress={progress} />}
          {chapter.id === 'overview' && <Overview review={review} elapsed={elapsed} />}
        </article>
      </section>
      <p className="status" role="status">{exportMessage}</p>
    </ReviewFrame>
  );
}
