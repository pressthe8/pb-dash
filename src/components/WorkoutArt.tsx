import { useMemo } from 'react';
import { Artwork } from './Artwork';
import { drawWake } from '../features/rowingReview/reviewArt';
import type { StoredResult } from '../types/concept2';
import { workoutCalendar } from '../../functions/src/workoutCalendar';

function paintWake(ctx: CanvasRenderingContext2D, width: number, height: number) {
  drawWake(ctx, width, height, .89, width < height);
}

export function WakeArt() {
  return <Artwork draw={paintWake} className="pb-wake" />;
}

const monthFormat = new Intl.DateTimeFormat('en', { month: 'short' });
const monthKey = (date: Date) => date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0');

export function TrainingRadar({ results }: { results: StoredResult[] }) {
  const months = useMemo(() => {
    const now = new Date();
    const counts = new Map<string, number>();
    for (const result of results) {
      const key = workoutCalendar(result.date)?.day.slice(0, 7);
      if (key) counts.set(key, (counts.get(key) ?? 0) + 1);
    }

    return Array.from({ length: 12 }, (_, index) => {
      const month = new Date(now.getFullYear(), now.getMonth() - 11 + index, 1);
      return { label: monthFormat.format(month), count: counts.get(monthKey(month)) ?? 0 };
    });
  }, [results]);

  function paint(ctx: CanvasRenderingContext2D, width: number, height: number) {
    ctx.save();
    ctx.translate(width / 2, height / 2);
    const size = Math.min(width, height);
    const compact = size < 190;
    const labelGap = compact ? 13 : 22;
    const radius = Math.min(size * .364, size / 2 - labelGap - (compact ? 9 : 13));
    const fullCircle = Math.PI * 2;
    const peak = Math.max(1, ...months.map(month => month.count));
    const angleAt = (index: number) => -Math.PI / 2 + index * fullCircle / 12;

    if (typeof ctx.createConicGradient === 'function') {
      const sweep = ctx.createConicGradient(angleAt(11) - 1.15, 0, 0);
      sweep.addColorStop(0, '#dfff8000');
      sweep.addColorStop(.183, '#dfff8040');
      sweep.addColorStop(.184, '#dfff8000');
      sweep.addColorStop(1, '#dfff8000');
      ctx.fillStyle = sweep;
      ctx.beginPath();
      ctx.arc(0, 0, radius, 0, fullCircle);
      ctx.fill();
    }

    ctx.strokeStyle = '#ad9ac459';
    for (const ring of [.25, .5, .75, 1]) {
      ctx.beginPath();
      ctx.arc(0, 0, radius * ring, 0, fullCircle);
      ctx.stroke();
    }

    for (let tick = 0; tick < 72; tick++) {
      ctx.save();
      ctx.rotate(tick * fullCircle / 72);
      ctx.beginPath();
      ctx.moveTo(0, -radius - 3);
      ctx.lineTo(0, -radius - (tick % 6 === 0 ? 9 : 6));
      ctx.stroke();
      ctx.restore();
    }

    ctx.font = `600 ${compact ? 8 : 9}px monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    months.forEach(({ label, count }, index) => {
      const angle = angleAt(index);
      const x = Math.cos(angle);
      const y = Math.sin(angle);
      const distance = radius * (count / peak) * .85;
      ctx.strokeStyle = '#dfff80';
      ctx.lineWidth = 1.6;
      ctx.lineCap = 'round';
      if (count) {
        ctx.beginPath();
        ctx.moveTo(x * radius * .1, y * radius * .1);
        ctx.lineTo(x * (distance + radius * .1), y * (distance + radius * .1));
        ctx.stroke();
        ctx.fillStyle = '#efffbd';
        ctx.beginPath();
        ctx.arc(x * (distance + radius * .1), y * (distance + radius * .1), 2.6, 0, fullCircle);
        ctx.fill();
      }
      ctx.fillStyle = index === 11 ? '#e9ffa6' : '#c6b7d6';
      ctx.fillText(label.toUpperCase(), x * (radius + labelGap), y * (radius + labelGap));
    });

    ctx.restore();
  }

  return (
    <figure className="pb-radar">
      <Artwork draw={paint} className="pb-radar-canvas" />
      <figcaption className="pb-label">Workouts · Last 12 months</figcaption>
      <ul className="sr-only">
        {months.map(({ label, count }) => <li key={label}>{label}, {count} workouts</li>)}
      </ul>
    </figure>
  );
}
