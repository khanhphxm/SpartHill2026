import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { Assignment, Size } from '../core/types.ts';
import { SIZES } from '../core/types.ts';
import { HORIZON_HOURS, NIGHTS } from '../core/config.ts';
import { spotId } from '../core/simulate.ts';
import { fmtDay, fmtInt, fmtTime, fmtWeekday, SIZE_LABEL } from './model.ts';

export function useWidth<T extends HTMLElement>(): [React.RefObject<T>, number] {
  const ref = useRef<T>(null);
  const [w, setW] = useState(800);
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(280, Math.floor(e.contentRect.width))));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

interface Tip { x: number; y: number; title: string; lines: [string | null, string][] }

function Tooltip({ tip, width }: { tip: Tip | null; width: number }) {
  if (!tip) return null;
  const left = tip.x + 230 > width ? Math.max(0, tip.x - 230) : tip.x + 12;
  return (
    <div className="tip" style={{ left, top: Math.max(0, tip.y - 12) }}>
      <div className="tip-title">{tip.title}</div>
      {tip.lines.map(([c, t], i) => (
        <div key={i}>{c && <span className="sw" style={{ background: c }} />}{t}</div>
      ))}
    </div>
  );
}

const niceMax = (v: number) => {
  if (v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  return [1, 2, 2.5, 5, 7.5, 10].map((m) => m * p).find((m) => m >= v) ?? v;
};
const ticks = (max: number, n = 4) => Array.from({ length: n + 1 }, (_, i) => (max * i) / n);

/** Day gridlines and labels along a time axis that starts at midnight. */
function DayAxis({ x0, x1, start, days, y, h, narrow }: { x0: number; x1: number; start: number; days: number; y: number; h: number; narrow: boolean }) {
  const step = (x1 - x0) / days;
  return (
    <g>
      {Array.from({ length: days + 1 }, (_, i) => (
        <line key={i} x1={x0 + i * step} x2={x0 + i * step} y1={y - h} y2={y} className="grid" />
      ))}
      {Array.from({ length: days }, (_, i) => (
        <text key={i} x={x0 + i * step + step / 2} y={y + 16} textAnchor="middle" className="tick">
          {narrow ? fmtWeekday(start + i * 1440) : fmtDay(start + i * 1440)}
        </text>
      ))}
    </g>
  );
}

export interface Series { key: string; label: string; color: string; values: (number | null)[]; width?: number; dash?: string }

/**
 * Hourly line chart over one week with an optional shaded band and a reference line.
 * Values are indexed by hour from `start`.
 */
export function WeekChart({ start, series, band, reference, height = 260, children }: {
  start: number; series: Series[]; band?: { lo: number[]; hi: number[]; color: string; label: string };
  reference?: { value: number; label: string }; height?: number; children?: ReactNode;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [tip, setTip] = useState<Tip | null>(null);
  const hours = NIGHTS * 24;
  const all = [...series.flatMap((s) => s.values.slice(0, hours)), ...(band?.hi.slice(0, hours) ?? []), reference?.value ?? 0].filter((v): v is number => v != null);
  const max = niceMax(Math.max(...all));
  const ml = 8 + String(fmtInt(max)).length * 8, mr = 12, mt = 8, mb = 26;
  const x = (h: number) => ml + (h / hours) * (width - ml - mr);
  const y = (v: number) => mt + (1 - v / max) * (height - mt - mb);
  const path = (vals: (number | null)[]) => vals.slice(0, hours + 1).map((v, h) => (v == null ? '' : `${h === 0 || vals[h - 1] == null ? 'M' : 'L'}${x(h).toFixed(1)},${y(v).toFixed(1)}`)).join('');
  const bandPath = band ? `M${band.hi.slice(0, hours + 1).map((v, h) => `${x(h).toFixed(1)},${y(v).toFixed(1)}`).join('L')}L${band.lo.slice(0, hours + 1).map((v, h) => `${x(h).toFixed(1)},${y(v).toFixed(1)}`).reverse().join('L')}Z` : '';
  const onMove = (e: React.MouseEvent<SVGRectElement>) => {
    const r = (e.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect();
    const px = e.clientX - r.left;
    const h = Math.max(0, Math.min(hours - 1, Math.round(((px - ml) / (width - ml - mr)) * hours)));
    const lines: [string | null, string][] = series.map((s) => [s.color, `${s.label}: ${s.values[h] == null ? '—' : fmtInt(s.values[h] as number)}`]);
    if (band) lines.splice(1, 0, [null, `${band.label}: ${fmtInt(band.lo[h])}–${fmtInt(band.hi[h])}`]);
    if (reference) lines.push([null, `${reference.label}: ${fmtInt(reference.value)}`]);
    setTip({ x: x(h), y: y(Math.max(...series.map((s) => s.values[h] ?? 0))), title: fmtTime(start + h * 60), lines });
  };
  return (
    <div className="chart" ref={ref}>
      <div className="legend">
        {band && <span><i className="band" style={{ background: band.color }} />{band.label}</span>}
        {series.map((s) => <span key={s.key}><i style={{ background: s.color }} className={s.dash ? 'dash' : ''} />{s.label}</span>)}
        {reference && <span><i className="dash ref" />{reference.label}</span>}
      </div>
      <svg width="100%" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Hourly chart">
        {ticks(max).map((v) => (
          <g key={v}>
            <line x1={ml} x2={width - mr} y1={y(v)} y2={y(v)} className="grid" />
            <text x={ml - 6} y={y(v)} dy="0.32em" textAnchor="end" className="tick">{fmtInt(v)}</text>
          </g>
        ))}
        <DayAxis x0={ml} x1={width - mr} start={start} days={NIGHTS} y={height - mb} h={height - mt - mb} narrow={width < 620} />
        {band && <path d={bandPath} fill={band.color} opacity={0.18} />}
        {series.map((s) => <path key={s.key} d={path(s.values)} fill="none" stroke={s.color} strokeWidth={s.width ?? 2} strokeDasharray={s.dash} strokeLinejoin="round" strokeLinecap="round" />)}
        {reference && <line x1={ml} x2={width - mr} y1={y(reference.value)} y2={y(reference.value)} className="ref-line" />}
        {children}
        {tip && <line x1={tip.x} x2={tip.x} y1={mt} y2={height - mb} className="axis" />}
        <rect x={ml} y={mt} width={width - ml - mr} height={height - mt - mb} fill="transparent" onMouseMove={onMove} onMouseLeave={() => setTip(null)} />
      </svg>
      <Tooltip tip={tip} width={width} />
    </div>
  );
}

const OUTCOME_COLOR = { overnight: 'var(--c-overnight)', drop_and_go: 'var(--c-drop)' } as const;

/** Spot-by-spot plan: one row per ramp spot, one bar per parked jet. */
export function RampGantt({ assignments, spots, weekStart }: { assignments: Assignment[]; spots: Record<Size, number>; weekStart: number }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [tip, setTip] = useState<Tip | null>(null);
  const rows = SIZES.flatMap((s) => Array.from({ length: spots[s] }, (_, i) => ({ id: spotId(s, i), size: s })));
  const rowH = 9, gap = 10, ml = 44, mr = 12, mt = 4, mb = 26;
  const groupTop: Record<Size, number> = { light: 0, midsize: 0, heavy: 0 };
  let yy = mt;
  for (const s of SIZES) { groupTop[s] = yy; yy += spots[s] * rowH + gap; }
  const height = yy - gap + mb;
  const rowY = new Map(rows.map((r) => [r.id, groupTop[r.size] + (Number(r.id.slice(1)) - 1) * rowH]));
  const span = NIGHTS * 1440;
  const x = (t: number) => ml + (Math.max(0, Math.min(span, t - weekStart)) / span) * (width - ml - mr);
  const parked = assignments.filter((a) => a.outcome === 'parked' && a.spotId);
  return (
    <div className="chart" ref={ref}>
      <div className="legend">
        <span><i style={{ background: OUTCOME_COLOR.overnight }} />Overnight stay</span>
        <span><i style={{ background: OUTCOME_COLOR.drop_and_go }} />Drop-and-go</span>
      </div>
      <svg width="100%" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Ramp spot schedule">
        <DayAxis x0={ml} x1={width - mr} start={weekStart} days={NIGHTS} y={height - mb} h={height - mb - mt} narrow={width < 620} />
        {SIZES.map((s) => (
          <g key={s}>
            <rect x={ml} y={groupTop[s]} width={width - ml - mr} height={spots[s] * rowH} className="lane" />
            <text x={ml - 6} y={groupTop[s] + (spots[s] * rowH) / 2} dy="0.32em" textAnchor="end" className="tick">{s === 'midsize' ? 'Mid' : SIZE_LABEL[s]}</text>
          </g>
        ))}
        {parked.map((a) => {
          const x0 = x(a.start), x1 = x(a.end);
          const y0 = rowY.get(a.spotId!) ?? 0;
          return (
            <rect key={a.flightId} x={x0} y={y0 + 1} width={Math.max(1.5, x1 - x0)} height={rowH - 2} rx={2}
              fill={OUTCOME_COLOR[a.stay]} className="bar"
              onMouseEnter={() => setTip({ x: x0, y: y0, title: `${a.spotId} · ${a.flightId}`, lines: [
                [OUTCOME_COLOR[a.stay], a.stay === 'overnight' ? 'Overnight stay' : 'Drop-and-go'],
                [null, `${SIZE_LABEL[a.size]} jet`],
                [null, `In: ${fmtTime(a.start)}`],
                [null, `Out: ${fmtTime(a.end)}`],
                [null, a.waitMin ? `Waited ${fmtInt(a.waitMin)} min for the spot` : 'No wait'],
              ] })}
              onMouseLeave={() => setTip(null)} />
          );
        })}
      </svg>
      <Tooltip tip={tip} width={width} />
    </div>
  );
}

/** Spots in use per hour against total spots, with refused jets per hour. */
export function rampUseSeries(occupancy: Record<Size, number[]>, assignments: Assignment[], weekStart: number) {
  const used = Array.from({ length: HORIZON_HOURS }, (_, h) => SIZES.reduce((n, s) => n + occupancy[s][h], 0));
  const refused = new Array(HORIZON_HOURS).fill(0);
  for (const a of assignments) {
    if (a.outcome === 'parked') continue;
    const h = Math.floor((a.arrival - weekStart) / 60);
    if (h >= 0 && h < HORIZON_HOURS) refused[h] += 1;
  }
  return { used, refused };
}
