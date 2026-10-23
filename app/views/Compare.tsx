import type { Metrics, PlannerKind, Scenario } from '../../core/types.ts';
import { COMPARED, fmtInt, fmtMin1, LABEL, PLANNER_LABEL, type ScenarioPlans } from '../model.ts';

const KINDS: PlannerKind[] = ['fcfs', 'historical', 'planner'];
const COLS: { key: keyof Metrics; label: string; fmt: (n: number) => string; hint: string }[] = [
  { key: 'turnedAway', label: 'Turned away', fmt: fmtInt, hint: 'No spot here and no room at an overflow airport' },
  { key: 'redirected', label: 'Sent to overflow', fmt: fmtInt, hint: 'Parked at an overflow airport instead' },
  { key: 'avgWaitMin', label: 'Avg wait (min)', fmt: fmtMin1, hint: 'Per parked jet' },
  { key: 'peakRampUse', label: 'Peak spots in use', fmt: fmtInt, hint: 'Most of our spots in use at once' },
  { key: 'idleWhileRefusing', label: 'Idle spot-hours while refusing', fmt: fmtInt, hint: 'Empty spots in hours a jet of that size was refused' },
];

export function Compare({ plans }: { plans: Record<Scenario, ScenarioPlans> }) {
  const maxTA = Math.max(...COMPARED.flatMap((s) => KINDS.map((k) => plans[s][k].result.metrics.turnedAway)), 1);
  return (
    <div className="stack">
      <section className="card">
        <h2>Three planners, same weeks</h2>
        <p className="note">
          Each planner's policy is replayed hour by hour on the same synthetic week. Lower is better in every column except peak spots in use.
          The fog row replays the plan made for the likely scenario, so it shows how that plan holds up when Saturday's arrivals bunch up.
        </p>
        <div className="table-box">
          <table className="compare">
            <thead>
              <tr><th>Scenario</th><th>Planner</th>{COLS.map((c) => <th key={c.key} className="num" title={c.hint}>{c.label}</th>)}</tr>
            </thead>
            <tbody>
              {COMPARED.flatMap((s) => {
                const best = Math.min(...KINDS.map((k) => plans[s][k].result.metrics.turnedAway));
                return KINDS.map((k, i) => {
                  const m = plans[s][k].result.metrics;
                  return (
                    <tr key={s + k} className={i === 0 ? 'group-start' : ''}>
                      {i === 0 && <th rowSpan={3} scope="rowgroup" className="scen">{LABEL[s]}<div className="sub">{fmtInt(m.flights)} jets</div></th>}
                      <td>{PLANNER_LABEL[k]}{k === 'planner' && plans[s].planFor !== s && <div className="sub">plan made for {LABEL[plans[s].planFor].toLowerCase()}</div>}</td>
                      {COLS.map((c) => (
                        <td key={c.key} className="num">
                          {c.key === 'turnedAway' ? (
                            <span className="inbar">
                              <span className={'bar-fill' + (m.turnedAway === best ? ' best' : '')} style={{ width: `${(m.turnedAway / maxTA) * 100}%` }} />
                              <span>{c.fmt(m.turnedAway)}</span>
                            </span>
                          ) : c.fmt(m[c.key])}
                        </td>
                      ))}
                    </tr>
                  );
                });
              })}
            </tbody>
          </table>
        </div>
        <p className="note">
          The historical-average rule is a stand-in: it keeps the normal-week drop-and-go share (25%) of each class free. The 2022 reference
          booking curve it should use isn't generated yet.
        </p>
      </section>
    </div>
  );
}
