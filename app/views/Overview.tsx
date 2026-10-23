import type { Scenario, Size } from '../../core/types.ts';
import { SIZES } from '../../core/types.ts';
import { NIGHTS } from '../../core/config.ts';
import { WeekChart } from '../charts.tsx';
import { fmtInt, fmtTime, LABEL, SIZE_LABEL, type AppData } from '../model.ts';

/** Total demand per hour from week start, for one scenario. */
function totals(data: AppData, s: Scenario): number[] {
  return data.hourly.filter((r) => r.scenario === s).sort((a, b) => a.t - b.t).map((r) => SIZES.reduce((n, k) => n + r.demand[k], 0));
}

/** First hour each size class has more jets wanting a spot than spots. */
function fillTimes(data: AppData) {
  return SIZES.map((size) => {
    const row: { size: Size } & Partial<Record<Scenario, number>> = { size };
    for (const s of ['low', 'likely', 'high'] as Scenario[]) {
      const hit = data.hourly.filter((r) => r.scenario === s).sort((a, b) => a.t - b.t).find((r) => r.demand[size] > r.spots[size]);
      if (hit) row[s] = hit.t;
    }
    return row;
  });
}

export function Overview({ data }: { data: AppData }) {
  const start = data.scenarios.likely.weekStart;
  const low = totals(data, 'low'), likely = totals(data, 'likely'), high = totals(data, 'high');
  const lo = likely.map((_, h) => Math.min(low[h], likely[h], high[h]));
  const hi = likely.map((_, h) => Math.max(low[h], likely[h], high[h]));
  const peakH = likely.indexOf(Math.max(...likely.slice(0, NIGHTS * 24)));
  const fills = fillTimes(data);
  return (
    <div className="stack">
      <section className="card">
        <h2>Demand for spots, event week</h2>
        <p className="note">
          Jets that want a spot each hour if nobody is turned away. At the likely peak ({fmtTime(start + peakH * 60)}) that is{' '}
          <b>{fmtInt(low[peakH])}–{fmtInt(high[peakH])}</b> jets (likely <b>{fmtInt(likely[peakH])}</b>) for <b>{fmtInt(data.totalSpots)}</b> spots.
          The normal week (Jan 13–19) is lined up by weekday.
        </p>
        <WeekChart
          start={start}
          band={{ lo, hi, color: 'var(--c-likely)', label: 'Low–high range' }}
          series={[
            { key: 'likely', label: 'Likely', color: 'var(--c-likely)', values: likely },
            { key: 'normal', label: 'Normal week', color: 'var(--c-muted)', values: totals(data, 'normal'), width: 1.5 },
          ]}
          reference={{ value: data.totalSpots, label: 'Total spots' }}
        />
      </section>
      <section className="card">
        <h2>When each size class fills</h2>
        <p className="note">The first hour more jets want a spot than there are spots, under first come, first served. A policy for that size has to be set before then.</p>
        <div className="table-box">
          <table>
            <thead><tr><th>Size class</th><th className="num">Spots</th>{(['low', 'likely', 'high'] as Scenario[]).map((s) => <th key={s}>{LABEL[s]}</th>)}</tr></thead>
            <tbody>
              {fills.map((r) => (
                <tr key={r.size}>
                  <td>{SIZE_LABEL[r.size]}</td>
                  <td className="num">{fmtInt(data.spots[r.size])}</td>
                  {(['low', 'likely', 'high'] as Scenario[]).map((s) => <td key={s}>{r[s] != null ? fmtTime(r[s] as number) : 'Never'}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section className="card">
        <h2>Ramp</h2>
        <div className="table-box">
          <table>
            <thead><tr><th>Size class</th><th className="num">Spots</th><th>Example types</th></tr></thead>
            <tbody>{data.rampTypes.map((r) => <tr key={r.size}><td>{SIZE_LABEL[r.size]}</td><td className="num">{fmtInt(r.spots)}</td><td>{r.examples}</td></tr>)}</tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
