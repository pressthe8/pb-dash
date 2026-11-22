import { REVIEW_YEAR } from './reviewConfig';
import { DAYS_IN_REVIEW, firstDayOfMonth, type ReviewSummary } from './reviewData';
import {
  MONTHS, SECONDS_PER_LAP, annualDistance, axisLabel, axisStep, clamp, fullRange, lapLayout,
  overviewStats, throughLabel, yearComplete,
} from './reviewPresentation';

const tau = Math.PI * 2;

function line(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number) {
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}

export function drawRadar(ctx: CanvasRenderingContext2D, width: number, height: number, review: ReviewSummary, cursor: number) {
  const chartThrough = review.window.daysElapsed;
  const r = Math.min(width * .37, height * .389);
  const from = -Math.PI / 2;
  const head = from + cursor / DAYS_IN_REVIEW * tau;
  const cutoffAngle = from + chartThrough / DAYS_IN_REVIEW * tau;
  ctx.save();
  ctx.translate(width / 2, height / 2);
  const glow = ctx.createRadialGradient(0, 0, 0, 0, 0, r * 1.4);
  glow.addColorStop(0, "#7454a65b");
  glow.addColorStop(1, "#7454a600");
  ctx.fillStyle = glow;
  ctx.fillRect(-width / 2, -height / 2, width, height);
  for (const ring of [.24, .48, .72, 1]) {
    ctx.strokeStyle = "#c0a8e373";
    ctx.beginPath();
    ctx.arc(0, 0, r * ring, 0, tau);
    ctx.stroke();
  }
  if (chartThrough < DAYS_IN_REVIEW) {
    ctx.fillStyle = "#baabd114";
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, r, cutoffAngle, from + tau);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "#d5c7eeae";
    ctx.setLineDash([2, 4]);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, r + 8, cutoffAngle, from + tau);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.lineWidth = 1;
  }
  ctx.strokeStyle = "#c6adda93";
  for (let day = 0; day < DAYS_IN_REVIEW; day += 2) {
    const angle = from + day / DAYS_IN_REVIEW * tau;
    const inner = r + (day % 10 === 0 ? 1 : 4);
    ctx.strokeStyle = day < chartThrough ? "#c6adda93" : "#c6adda39";
    const x = Math.cos(angle);
    const y = Math.sin(angle);
    line(ctx, x * inner, y * inner, x * (r + 8), y * (r + 8));
  }
  ctx.fillStyle = "#e6d5fb";
  ctx.font = "600 " + (width < 375 ? 10 : 12) + "px monospace";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  MONTHS.forEach((name, index) => {
    const day = firstDayOfMonth(index);
    const angle = from + day / DAYS_IN_REVIEW * tau;
    ctx.fillStyle = day < chartThrough ? "#e6d5fb" : "#c2afd9";
    ctx.fillText(name.slice(0, 3).toUpperCase(), Math.cos(angle) * (r + 23), Math.sin(angle) * (r + 23));
  });
  if (typeof ctx.createConicGradient === "function") {
    const sweep = ctx.createConicGradient(head - .74, 0, 0);
    sweep.addColorStop(0, "#dfff8000");
    sweep.addColorStop(.117, "#dfff8052");
    sweep.addColorStop(.118, "#dfff8000");
    sweep.addColorStop(1, "#dfff8000");
    ctx.fillStyle = sweep;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, tau);
    ctx.fill();
  }
  ctx.lineCap = "round";
  const dense = review.activeDays > 180;
  const arcStep = r * tau / DAYS_IN_REVIEW;
  ctx.lineWidth = dense ? Math.max(.45, arcStep * .38) : Math.min(width < 375 ? 2 : 2.7, Math.max(.85, arcStep * .8));
  ctx.strokeStyle = "#dfff80";
  ctx.shadowColor = "#dfff80";
  ctx.shadowBlur = dense ? 0 : 5;
  for (let day = 0; day < Math.min(chartThrough, Math.floor(cursor)); day++) {
    const meters = review.daily[day];
    if (!meters) continue;
    const angle = from + day / DAYS_IN_REVIEW * tau;
    const inner = r * (.91 - .64 * meters / review.dayPeak);
    const x = Math.cos(angle);
    const y = Math.sin(angle);
    line(ctx, x * inner, y * inner, x * r * .96, y * r * .96);
  }
  ctx.shadowBlur = 0;
  ctx.lineWidth = 1;
  ctx.strokeStyle = "#f2ffd1a1";
  line(ctx, 0, 0, Math.cos(head) * r, Math.sin(head) * r);
  ctx.fillStyle = "#e6ffac";
  ctx.beginPath();
  ctx.arc(0, 0, 3, 0, tau);
  ctx.fill();
  ctx.restore();
}

export function drawDistance(ctx: CanvasRenderingContext2D, width: number, height: number, review: ReviewSummary, cursor: number) {
  const chartThrough = review.window.daysElapsed;
  const cumulative = review.cumulative;
  const left = width < 350 ? 48 : 56;
  const right = width - 12;
  const top = 33;
  const bottom = height - 37;
  const step = axisStep(review.meters, 6);
  const roof = Math.max(step, Math.ceil(review.meters / step) * step);
  const solidThrough = Math.min(chartThrough, cursor);
  const visible = Math.floor(solidThrough);
  const x = (index: number) => left + index / DAYS_IN_REVIEW * (right - left);
  const y = (meters: number) => bottom - meters / roof * (bottom - top);
  const cutoffX = x(chartThrough);
  ctx.save();
  ctx.fillStyle = "#8daaaa13";
  ctx.fillRect(cutoffX, top, right - cutoffX, bottom - top);
  ctx.font = "600 " + (width < 380 ? 10 : 12) + "px monospace";
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  ctx.strokeStyle = "#80b5af49";
  ctx.fillStyle = "#c9ebe2";
  for (let meters = 0; meters <= roof; meters += step) {
    const yy = y(meters);
    line(ctx, left, yy, right, yy);
    ctx.fillText(axisLabel(meters, roof >= 2000), left - 7, yy, left - 9);
  }
  ctx.textAlign = "center";
  for (let index = 0; index < MONTHS.length; index += 2) {
    const xx = x(firstDayOfMonth(index));
    line(ctx, xx, top, xx, bottom);
    const label = MONTHS[index].slice(0, 3).toUpperCase();
    const labelX = index === 10 && width < 390 ? xx - 13 : xx;
    ctx.fillText(label, labelX, bottom + 17);
  }
  line(ctx, right, top, right, bottom);
  ctx.textAlign = "right";
  ctx.fillText("31 DEC", right, bottom + 17);

  if (chartThrough < DAYS_IN_REVIEW) {
    ctx.strokeStyle = "#adc6c39c";
    ctx.setLineDash([3, 5]);
    line(ctx, cutoffX, top, cutoffX, bottom);
    ctx.setLineDash([]);
    ctx.fillStyle = "#dcebe8";
    ctx.fillText(throughLabel(review).toUpperCase(), Math.max(left + 27, cutoffX - 4), top - 12);
  }

  const gradient = ctx.createLinearGradient(0, top, 0, bottom);
  gradient.addColorStop(0, "#71f9da71");
  gradient.addColorStop(1, "#71f9da0b");
  const trace = () => {
    ctx.beginPath();
    ctx.moveTo(left, bottom);
    for (let day = 1; day <= visible; day++) ctx.lineTo(x(day), y(cumulative[day]));
    if (solidThrough > visible) ctx.lineTo(x(solidThrough), y(cumulative[visible]));
  };
  const endX = x(solidThrough);
  const endY = y(cumulative[visible]);
  trace();
  ctx.lineTo(endX, bottom);
  ctx.closePath();
  ctx.fillStyle = gradient;
  ctx.fill();

  trace();
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = "#9dffe9";
  ctx.lineJoin = "round";
  ctx.shadowColor = "#76eddb";
  ctx.shadowBlur = 12;
  ctx.stroke();
  ctx.fillStyle = "#d6fff7";
  ctx.beginPath();
  ctx.arc(endX, endY, 4, 0, tau);
  ctx.fill();

  if (cursor > chartThrough) {
    ctx.shadowBlur = 0;
    ctx.strokeStyle = "#9abfbbe0";
    ctx.lineWidth = 1.7;
    ctx.lineCap = "round";
    ctx.setLineDash([1, 5]);
    line(ctx, cutoffX, endY, x(cursor), endY);
    ctx.setLineDash([]);
  }
  ctx.restore();
}

// Sample the same rounded course by distance on each lap so a quarter-turn is six hours.
function circuitPoint(fraction: number, halfStraight: number, radius: number): [number, number] {
  let distance = fraction * (4 * halfStraight + tau * radius);
  if (distance <= halfStraight) return [distance, -radius];
  distance -= halfStraight;
  if (distance <= Math.PI * radius) {
    const angle = -Math.PI / 2 + distance / radius;
    return [halfStraight + Math.cos(angle) * radius, Math.sin(angle) * radius];
  }
  distance -= Math.PI * radius;
  if (distance <= 2 * halfStraight) return [halfStraight - distance, radius];
  distance -= 2 * halfStraight;
  if (distance <= Math.PI * radius) {
    const angle = Math.PI / 2 + distance / radius;
    return [-halfStraight + Math.cos(angle) * radius, Math.sin(angle) * radius];
  }
  return [-halfStraight + distance - Math.PI * radius, -radius];
}

export function drawLaps(ctx: CanvasRenderingContext2D, width: number, height: number, layout: ReturnType<typeof lapLayout>, seconds: number) {
  const { visible: visualLaps, partial: partialLapSeconds, drawnFull: wholeLapsDrawn, full: wholeLaps } = layout;
  const narrow = width < 420;
  const outer = Math.min(height * .34, width * .235);
  const straight = width * (narrow ? .19 : .22);
  const gap = Math.min(26, width * .065, outer * .41 / Math.max(1, visualLaps - 1));
  const stroke = Math.min(narrow ? 5 : 7, Math.max(2.7, gap * .50));
  ctx.save();
  ctx.translate(width / 2, height / 2);
  const halo = ctx.createRadialGradient(0, 0, 0, 0, 0, width * .54);
  halo.addColorStop(0, "#a260673a");
  halo.addColorStop(1, "#a2606700");
  ctx.fillStyle = halo;
  ctx.fillRect(-width / 2, -height / 2, width, height);

  function trace(radius: number, fraction: number) {
    const points = Math.max(1, Math.ceil(fraction * 152));
    ctx.beginPath();
    ctx.moveTo(0, -radius);
    for (let i = 1; i <= points; i++) {
      ctx.lineTo(...circuitPoint(i / points * fraction, straight, radius));
    }
    ctx.stroke();
  }

  ctx.lineCap = "round";
  for (let lap = 0; lap < visualLaps; lap++) {
    const partial = partialLapSeconds > 0 && lap === wholeLapsDrawn;
    const lapStart = (partial ? wholeLaps : lap) * SECONDS_PER_LAP;
    const fraction = clamp((seconds - lapStart) / SECONDS_PER_LAP);
    const radius = outer - (visualLaps - 1 - lap) * gap;
    const color = partial && wholeLaps > 0 ? "#e3bcff" : lap % 2 === 0 ? "#ffbf83" : "#ffd7ab";
    ctx.strokeStyle = partial ? "#866ca673" : "#ad736a64";
    ctx.lineWidth = stroke;
    trace(radius, 1);
    if (fraction <= 0) continue;
    ctx.shadowColor = color;
    ctx.shadowBlur = visualLaps > 3 ? 7 : narrow ? 13 : 18;
    ctx.strokeStyle = color;
    trace(radius, fraction);
    ctx.shadowBlur = 0;
    if (fraction < 1) {
      ctx.fillStyle = "#fff5e7";
      ctx.beginPath();
      ctx.arc(...circuitPoint(fraction, straight, radius), stroke * .67, 0, tau);
      ctx.fill();
    }
  }

  ctx.fillStyle = "#f7dccc";
  ctx.font = "600 " + (narrow ? 10 : 12) + "px monospace";
  ctx.textBaseline = "middle";
  ctx.textAlign = "center";
  ctx.fillText("0 / 24H", 0, -outer - 18);
  ctx.fillText("12H", 0, outer + 19);
  ctx.fillText("6H", Math.min(width / 2 - 8, straight + outer + 12), -13);
  ctx.fillText("18H", -Math.min(width / 2 - 11, straight + outer + 13), 13);
  ctx.restore();
}

export function drawWake(ctx: CanvasRenderingContext2D, width: number, height: number, progress: number, portrait: boolean) {
  const water = ctx.createLinearGradient(0, 0, width * .95, height);
  water.addColorStop(0, "#041517");
  water.addColorStop(.58, "#0b3237");
  water.addColorStop(1, "#051519");
  ctx.fillStyle = water;
  ctx.fillRect(0, 0, width, height);

  const surface = ctx.createRadialGradient(width * .77, height * .19, 0, width * .77, height * .19, width * .72);
  surface.addColorStop(0, "#50a5a32c");
  surface.addColorStop(1, "#50a5a300");
  ctx.fillStyle = surface;
  ctx.fillRect(0, 0, width, height);
  const scale = Math.min(width, height);
  ctx.lineWidth = .7;
  // The little reflections stay in water coordinates as the shell passes over them.
  for (let i = 1; i <= 680; i++) {
    const x = ((i * 3899) % 18617) / 18617 * width;
    const y = ((i * 12113) % 16787) / 16787 * height;
    const length = (2 + i % 17) * scale * .0023;
    const light = .026 + (.5 + .5 * Math.sin(i * .84 + progress * 3)) * .052;
    ctx.strokeStyle = "rgba(139,226,213," + light + ")";
    line(ctx, x, y, x + length, y - length * .13);
  }

  const swim = (time: number) => time * .72 + time * time * (3 - 2 * time) * .28;
  const startX = width * (portrait ? .12 : .14);
  const startY = height * .91;
  const dx = width * (portrait ? .71 : .68);
  const endY = !portrait ? .16 : width < 820 ? .62 : .52;
  const dy = height * endY - startY;
  const hullAt = (time: number) => {
    const travel = swim(time);
    const rise = dy + height * .052 * Math.PI * Math.cos(Math.PI * travel);
    return {
      x: startX + dx * travel,
      y: startY + dy * travel + height * .052 * Math.sin(Math.PI * travel),
      angle: Math.atan2(rise, dx) + Math.PI / 2,
    };
  };
  const shell = hullAt(progress);
  const hullSize = Math.min(25, Math.max(16, scale * .043));
  const wakes = 44;
  // Emit discrete crests in the shell's past positions. Each widens and loses
  // contrast with age, so the water across the stern is a succession of ripples.
  for (let i = 0; i < wakes; i++) {
    const emission = (i + .18 * Math.sin(i * Math.PI / 2)) / wakes;
    const age = progress - emission;
    if (age <= 0) break;
    if (age > .8) continue;
    const origin = hullAt(emission);
    const width = scale * (.016 + age * .45) * (.91 + .09 * Math.sin(i * 1.05));
    const fade = (1 - Math.exp(-age * 52)) * Math.exp(-age * 2.15) * clamp((.8 - age) / .39);
    const aft = hullSize * .67 + age * scale * .09;
    ctx.save();
    ctx.translate(origin.x, origin.y);
    ctx.rotate(origin.angle);
    const crest = ctx.createLinearGradient(-width, 0, width, 0);
    crest.addColorStop(0, "#a2ffef00");
    crest.addColorStop(.15, "#84e6d5d6");
    crest.addColorStop(.37, "#6ebfb3a0");
    crest.addColorStop(.5, "#b9fff1c0");
    crest.addColorStop(.69, "#73bcaf86");
    crest.addColorStop(.86, "#a2ffefd2");
    crest.addColorStop(1, "#a2ffef00");

    const contour = (offset: number) => {
      ctx.beginPath();
      for (let point = 0; point <= 20; point++) {
        const s = point / 10 - 1;
        const x = width * s;
        const y = aft + offset + width * .49 * (Math.abs(s) ** 2)
          + Math.sin(s * 9 + i * 2.47) * width * .047;
        if (point === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
    };
    ctx.globalAlpha = fade * .48;
    ctx.lineWidth = Math.min(3.6, 1.3 + age * 3.8);
    ctx.strokeStyle = "#041c20";
    contour(2.6);
    ctx.stroke();
    ctx.globalAlpha = fade * (.67 + .28 * Math.cos(i * 1.77) ** 2);
    ctx.strokeStyle = crest;
    ctx.lineWidth = 1.1 + (i % 4 === 0 ? .65 : 0);
    contour(0);
    ctx.stroke();

    // Tiny, irregular specular highlights break up the freshest crests.
    if (age < .29) {
      ctx.fillStyle = "#cffcf1";
      for (let fleck = 0; fleck < 5; fleck++) {
        const s = Math.sin(i * 23 + fleck * 39.1);
        const x = width * s;
        const y = aft + width * .49 * s * s + Math.sin(fleck * 13 + i) * 6;
        ctx.globalAlpha = fade * (.15 + fleck * .08);
        ctx.fillRect(x, y, 1.1 + (fleck % 3), .85);
      }
    }
    ctx.restore();
  }

  // Short flecks of turbulent water form at the stern and disperse locally.
  ctx.save();
  ctx.fillStyle = "#b6f4e8";
  for (let i = 0; i < 100; i++) {
    const age = i * .0025;
    if (age > progress) break;
    const birth = hullAt(progress - age);
    const jitter = Math.sin(i * 19.17);
    const spread = 2.2 + age * scale * .16;
    const across = jitter * spread;
    const aft = hullSize * .9 + age * scale * .065;
    const x = birth.x + Math.cos(birth.angle) * across - Math.sin(birth.angle) * aft;
    const y = birth.y + Math.sin(birth.angle) * across + Math.cos(birth.angle) * aft;
    ctx.globalAlpha = .54 * (1 - age / .25) ** 1.6 * (i % 5 + 1) / 5;
    ctx.fillRect(x, y, .9 + (i % 4) * .48, .85);
  }
  ctx.restore();

  const span = hullSize * .98;
  for (let stroke = 0; stroke < 4; stroke++) {
    const dip = (stroke + .25) / 3.4;
    const age = progress - dip;
    if (age <= 0 || age >= .23) continue;
    const origin = hullAt(dip);
    ctx.save();
    ctx.translate(origin.x, origin.y);
    ctx.rotate(origin.angle);
    ctx.strokeStyle = "#b3f9e7";
    ctx.lineWidth = 1.15;
    ctx.globalAlpha = .62 * (1 - age / .23) ** 2;
    const radius = 2.5 + age * scale * .16;
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.ellipse(side * span, 6, radius, radius * .56, side * .18, .32, tau - .48);
      ctx.stroke();
    }
    ctx.restore();
  }

  // Keep the wake visible behind the figures without compromising the text.
  const shade = ctx.createLinearGradient(0, 0, width, 0);
  shade.addColorStop(0, "#041517bc");
  shade.addColorStop(.41, "#04151790");
  shade.addColorStop(1, "#04151700");
  ctx.fillStyle = shade;
  ctx.fillRect(0, 0, width, height);

  ctx.save();
  ctx.translate(shell.x, shell.y);
  ctx.rotate(shell.angle);
  ctx.fillStyle = "#091f24";
  ctx.beginPath();
  ctx.ellipse(0, 1, 4.5, hullSize * .90, 0, 0, tau);
  ctx.fill();
  ctx.shadowColor = "#74ebd9";
  ctx.shadowBlur = 8;
  ctx.fillStyle = "#e0fff5";
  ctx.beginPath();
  ctx.moveTo(0, -hullSize);
  ctx.quadraticCurveTo(5.5, -3, 0, hullSize * .9);
  ctx.quadraticCurveTo(-5.5, -3, 0, -hullSize);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.fillStyle = "#3a7f7a";
  ctx.fillRect(-1.5, -3, 3, 8);
  const sweep = Math.sin(progress * tau * 3.4 + .4) * .37;
  ctx.lineCap = "round";
  for (const side of [-1, 1]) {
    const bladeX = side * span * Math.cos(sweep);
    const bladeY = 1 + span * Math.sin(sweep);
    ctx.lineWidth = 1;
    ctx.strokeStyle = "#b7e0d9";
    line(ctx, side * 2.2, 1, bladeX, bladeY);
    ctx.lineWidth = 2.9;
    ctx.strokeStyle = "#c8fff2";
    line(ctx, bladeX - side * 1.2, bladeY, bladeX + side * 2.2, bladeY + 1);
  }
  ctx.restore();
}


export async function shareReviewPoster(review: ReviewSummary): Promise<void> {
  const canvas = document.createElement('canvas');
  canvas.width = 1080;
  canvas.height = 1350;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas unavailable');
  drawWake(ctx, canvas.width, canvas.height, 1, true);

  const accent = '#a3f5e2';
  const text = (value: string, x: number, y: number, font: string, color = '#effff9', maxWidth = 928) => {
    ctx.font = font;
    ctx.fillStyle = color;
    ctx.fillText(value, x, y, maxWidth);
  };

  ctx.strokeStyle = accent;
  ctx.lineWidth = 2;
  line(ctx, 77, 129, 1003, 129);
  text('CONCEPT2 ROWING ' + REVIEW_YEAR, 77, 103, '700 25px monospace', accent);
  ctx.textAlign = 'right';
  text('pbdash.pressthe8.com', 1003, 103, '700 25px monospace', accent);
  ctx.textAlign = 'left';
  text('Your year', 69, 275, 'italic 142px Georgia');
  text('on the erg.', 69, 404, 'italic 142px Georgia');
  text(annualDistance(review.meters), 69, 588, '700 153px sans-serif');
  text('TOTAL DISTANCE', 78, 646, '700 28px monospace', accent);

  overviewStats(review).forEach(({ label, value }, index) => {
    const x = 78 + (index % 3) * 310;
    const y = 792 + Math.floor(index / 3) * 166;
    ctx.strokeStyle = '#94dac3a0';
    line(ctx, x, y - 50, x + 265, y - 50);
    text(value, x, y + 7, '700 54px sans-serif', '#effff9', 270);
    text(label.toUpperCase(), x, y + 47, '700 22px monospace', accent, 270);
  });

  ctx.strokeStyle = accent;
  line(ctx, 77, 1217, 1003, 1217);
  text(fullRange.toUpperCase(), 77, 1273, '700 25px monospace', accent);
  if (!yearComplete(review)) {
    ctx.textAlign = 'right';
    text(('Stats through ' + throughLabel(review)).toUpperCase(), 1003, 1273, '700 24px monospace', accent);
  }

  // Encode synchronously so the native share call keeps the button's user activation.
  const dataUrl = canvas.toDataURL('image/png');
  if (!dataUrl.startsWith('data:image/png;base64,')) throw new Error('Unable to encode PNG');
  const bytes = Uint8Array.from(atob(dataUrl.slice(dataUrl.indexOf(',') + 1)), char => char.charCodeAt(0));
  const file = new File([bytes], 'pb-dash-' + REVIEW_YEAR + '-overview.png', { type: 'image/png' });
  const shareData = { files: [file] };
  if (navigator.share && navigator.canShare?.(shareData)) {
    try {
      await navigator.share(shareData);
      return;
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
    }
  }

  const url = URL.createObjectURL(file);
  const link = document.createElement('a');
  link.href = url;
  link.download = file.name;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
