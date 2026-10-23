import { useMemo, useState } from 'react';
import type { Policy, Scenario } from '../../core/types.ts';
import { SIZES } from '../../core/types.ts';
import { OVERFLOW_AIRPORTS } from '../../core/config.ts';
import { RampGantt, rampUseSeries, WeekChart } from '../charts.tsx';
import { COMPARED, fmtInt, fmtTime, LABEL, PLANNER_LABEL, runPolicy, SIZE_LABEL, triggerText, type AppData, type ScenarioPlans } from '../model.ts';

type Choice = 'fcfs' | 'historical' | 'planner' | 'manager';
const REASON: Record<string, string> = { overnight_cap: 'Overnight cap reached', drop_and_go_only: 'Drop-and-go only', ramp_full: 'No spot within 30 min' };
const AIRPORT = new Map(OVERFLOW_AIRPORTS.map((a) => [a.id, a.name]));

export function Schedule({ data, plans, managerPolicy }: {
  data: AppData; plans: Record<Scenario, ScenarioPlans>; managerPolicy: Partial<Record<Scenario, Policy>>;
}) {
  const [scenario, setScenario] = useState<Scenario>('likely');
  const [choice, setChoice] = useState<Choice>('planner');
  const [query, setQuery] = useState('');
  const planScenario = plans[scenario].planFor;
  const manager = managerPolicy[planScenario];
  const active: Choice = choice === 'manager' && !manager ? 'planner' : choice;

  const { policy, result } = useMemo(() => {
    if (active === 'manager' && manager) return { policy: manager, result: runPolicy(data, scenario, manager) };
    const e = plans[scenario][active as Exclude<Choice, 'manager'>];
    return { policy: e.policy, result: e.result };
  }, [active, manager, scenario, plans, data]);

  const { used, refused } = useMemo(() => rampUseSeries(result.occupancy, result.assignments, result.weekStart), [result]);
  const refusedRows = result.assignments.filter((a) => a.outcome !== 'parked')
    .filter((a) => !query || [a.flightId, a.size, a.stay, a.outcome, a.reason ?? '', fmtTime(a.arrival)].join(' ').toLowerCase().includes(query.toLowerCase()));
  const m = result.metrics;

  return (
    <div className="stack">
      <section className="card controls">
        <label>Scenario
          <select id="sched-scenario" value={scenario} onChange={(e) => setScenario(e.target.value as Scenario)}>
            {COMPARED.map((s) => <option key={s} value={s}>{LABEL[s]}</option>)}
          </select>
        </label>
        <label>Policy
          <select id="sched-policy" value={active} onChange={(e) => setChoice(e.target.value as Choice)}>
            <option value="fcfs">{PLANNER_LABEL.fcfs}</option>
            <option value="historical">{PLANNER_LABEL.historical}</option>
            <option value="planner">{PLANNER_LABEL.planner}</option>
            <option value="manager" disabled={!manager}>{PLANNER_LABEL.manager}{manager ? '' : ' (none yet)'}</option>
          </select>
        </label>
        <div className="policy-line">
          Overnight caps: {SIZES.map((s) => `${SIZE_LABEL[s]} ${fmtInt(Math.max(...policy.overnightCap[s]))}`).join(' · ')}
          {' '}· Drop-and-go only: {triggerText(policy.dropAndGoOnlyAt)} · Overflow: {policy.overflowOrder.join(' → ')}
        </div>
      </section>

      <div className="tiles">
        <div className="tile"><div className="lbl">Parked here</div><div className="val">{fmtInt(m.parked)}</div><div className="sub">of {fmtInt(m.flights)} jets</div></div>
        <div className="tile"><div className="lbl">Sent to overflow</div><div className="val">{fmtInt(m.redirected)}</div></div>
        <div className="tile bad"><div className="lbl">Turned away</div><div className="val">{fmtInt(m.turnedAway)}</div></div>
        <div className="tile"><div className="lbl">Avg wait</div><div className="val">{m.avgWaitMin.toFixed(1)}</div><div className="sub">minutes per parked jet</div></div>
      </div>

      <section className="card">
        <h2>Spots in use and jets refused</h2>
        <p className="note">Simulated, hour by hour. Refused jets are sent to overflow or turned away.</p>
        <WeekChart
          start={result.weekStart}
          height={220}
          series={[
            { key: 'used', label: 'Spots in use', color: 'var(--c-likely)', values: used },
            { key: 'refused', label: 'Jets refused this hour', color: 'var(--c-bad)', values: refused, width: 1.5 },
          ]}
          reference={{ value: data.totalSpots, label: 'Total spots' }}
        />
      </section>

      <section className="card">
        <h2>Ramp plan by spot</h2>
        <p className="note">Simulated plan for each of the {fmtInt(data.totalSpots)} spots. It is not a reservation: the tool does not grant spots or move aircraft.</p>
        <RampGantt assignments={result.assignments} spots={data.spots} weekStart={result.weekStart} />
      </section>

      <section className="card">
        <h2>Refused jets</h2>
        <div className="row">
          <input id="refused-search" type="search" placeholder="Search id, size, reason, day" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search refused jets" />
          <span className="sub">{fmtInt(refusedRows.length)} jets</span>
        </div>
        <div className="table-box tall">
          <table>
            <thead><tr><th>Flight id</th><th>Arrival</th><th>Size</th><th>Stay</th><th>Why</th><th>Outcome</th></tr></thead>
            <tbody>
              {refusedRows.slice(0, 500).map((a) => (
                <tr key={a.flightId}>
                  <td className="mono">{a.flightId}</td>
                  <td>{fmtTime(a.arrival)}</td>
                  <td>{SIZE_LABEL[a.size]}</td>
                  <td>{a.stay === 'overnight' ? 'Overnight' : 'Drop-and-go'}</td>
                  <td>{a.reason ? REASON[a.reason] : ''}</td>
                  <td><span className={'chip ' + a.outcome}>{a.outcome === 'redirected' ? AIRPORT.get(a.airport ?? '') : 'Turned away'}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {refusedRows.length > 500 && <p className="note">Showing the first 500. Search to narrow the list.</p>}
      </section>
    </div>
  );
}
