import { useMemo, useState } from 'react';
import type { Metrics, Policy, Scenario, Size } from '../../core/types.ts';
import { SIZES } from '../../core/types.ts';
import { NIGHTS, OVERFLOW_AIRPORTS, TRIGGER_OPTIONS } from '../../core/config.ts';
import { allowedNumbers, explain, unknownNumbers } from '../../core/explain.ts';
import {
  fmtDay, fmtInt, fmtMin1, LABEL, latestDecisions, PLANNED, runPolicy, SIZE_LABEL, triggerText,
  type AppData, type Decision, type ScenarioPlans,
} from '../model.ts';

type Action = Decision['action'];
const STATUS: Record<Action, string> = { approve: 'Approved', edit: 'Approved with edits', reject: 'Rejected' };

function orders(ids: string[]): string[][] {
  if (ids.length <= 1) return [ids];
  return ids.flatMap((x, i) => orders([...ids.slice(0, i), ...ids.slice(i + 1)]).map((p) => [x, ...p]));
}
const ORDERS = orders(OVERFLOW_AIRPORTS.map((a) => a.id));

function MetricRow({ label, m, base }: { label: string; m: Metrics; base?: Metrics }) {
  const delta = (a: number, b?: number) => (b == null || a === b ? '' : ` (${a < b ? '−' : '+'}${fmtInt(Math.abs(a - b))})`);
  return (
    <tr>
      <td>{label}</td>
      <td className="num">{fmtInt(m.turnedAway)}{delta(m.turnedAway, base?.turnedAway)}</td>
      <td className="num">{fmtInt(m.redirected)}</td>
      <td className="num">{fmtMin1(m.avgWaitMin)}</td>
    </tr>
  );
}

function PolicyEditor({ data, scenario, initial, onCancel, onSave }: {
  data: AppData; scenario: Scenario; initial: Policy; onCancel: () => void; onSave: (p: Policy, m: Metrics, note: string) => void;
}) {
  const [policy, setPolicy] = useState<Policy>(() => structuredClone(initial));
  const [note, setNote] = useState('');
  const result = useMemo(() => runPolicy(data, scenario, policy), [data, scenario, policy]);
  const start = data.scenarios[scenario].weekStart;
  const setCap = (s: Size, n: number, v: number) => setPolicy((p) => {
    const caps = structuredClone(p.overnightCap);
    caps[s][n] = Math.max(0, Math.min(data.spots[s], Math.round(v) || 0));
    return { ...p, overnightCap: caps };
  });
  return (
    <div className="editor">
      <h4>Edit policy</h4>
      <div className="table-box">
        <table className="caps">
          <thead><tr><th>Overnight cap</th>{Array.from({ length: NIGHTS }, (_, n) => <th key={n} className="num">{fmtDay(start + n * 1440)}</th>)}</tr></thead>
          <tbody>
            {SIZES.map((s) => (
              <tr key={s}>
                <td>{SIZE_LABEL[s]} <span className="sub">of {fmtInt(data.spots[s])}</span></td>
                {policy.overnightCap[s].map((v, n) => (
                  <td key={n} className="num">
                    <input id={`cap-${scenario}-${s}-${n}`} type="number" min={0} max={data.spots[s]} value={v} aria-label={`${SIZE_LABEL[s]} cap, night ${n + 1}`}
                      onChange={(e) => setCap(s, n, Number(e.target.value))} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="row">
        <label>Drop-and-go only at
          <select id={`trig-${scenario}`} value={policy.dropAndGoOnlyAt} onChange={(e) => setPolicy((p) => ({ ...p, dropAndGoOnlyAt: Number(e.target.value) }))}>
            {TRIGGER_OPTIONS.map((t) => <option key={t} value={t}>{triggerText(t)}</option>)}
          </select>
        </label>
        <label>Overflow order
          <select id={`order-${scenario}`} value={policy.overflowOrder.join('')} onChange={(e) => setPolicy((p) => ({ ...p, overflowOrder: e.target.value.split('') }))}>
            {ORDERS.map((o) => <option key={o.join('')} value={o.join('')}>{o.join(' → ')}</option>)}
          </select>
        </label>
      </div>
      <p className="note">With these edits the simulation turns away <b>{fmtInt(result.metrics.turnedAway)}</b> jets, sends <b>{fmtInt(result.metrics.redirected)}</b> to overflow, and parked jets wait <b>{fmtMin1(result.metrics.avgWaitMin)}</b> min on average.</p>
      <label className="block">Note (optional). Don't include tail numbers or names.
        <textarea id={`note-edit-${scenario}`} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
      </label>
      <div className="row">
        <button className="primary" onClick={() => onSave(policy, result.metrics, note)}>Save edited plan</button>
        <button onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

function Card({ data, scenario, plans, decision, serverOk, onDecide }: {
  data: AppData; scenario: Scenario; plans: ScenarioPlans; decision?: Decision; serverOk: boolean;
  onDecide: (scenario: Scenario, action: Action, policy: Policy, metrics: Metrics, note: string) => Promise<boolean>;
}) {
  const [mode, setMode] = useState<'view' | 'edit' | 'reject'>('view');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const p = plans.planner;
  const input = { scenarioLabel: LABEL[scenario].toLowerCase(), policy: p.policy, planner: p.result.metrics, fcfs: plans.fcfs.result.metrics, historical: plans.historical.result.metrics };
  const text = explain(input);
  const bad = unknownNumbers(text, allowedNumbers(input));
  const act = async (action: Action, policy: Policy, metrics: Metrics, n: string) => {
    setBusy(true);
    const ok = await onDecide(scenario, action, policy, metrics, n);
    setBusy(false);
    if (ok) { setMode('view'); setNote(''); }
  };
  return (
    <article className="card rec">
      <header className="rec-head">
        <h3>{LABEL[scenario]} demand</h3>
        <span className={'chip ' + (decision ? decision.action : 'pending')}>{decision ? STATUS[decision.action] : 'Waiting for decision'}</span>
      </header>
      {bad.length ? (
        <p className="warn">Explanation rejected: it has numbers that are not in the planner output ({bad.join(', ')}).</p>
      ) : (
        <p className="explain">{text}</p>
      )}
      <dl className="policy">
        {SIZES.map((s) => <div key={s}><dt>{SIZE_LABEL[s]} overnight cap</dt><dd>{fmtInt(p.policy.overnightCap[s][0])} of {fmtInt(data.spots[s])} each night</dd></div>)}
        <div><dt>Drop-and-go only</dt><dd>{triggerText(p.policy.dropAndGoOnlyAt)}</dd></div>
        <div><dt>Overflow order</dt><dd>{p.policy.overflowOrder.join(' → ')}</dd></div>
      </dl>
      <div className="table-box">
        <table>
          <thead><tr><th>Simulated week</th><th className="num">Turned away</th><th className="num">To overflow</th><th className="num">Avg wait (min)</th></tr></thead>
          <tbody>
            <MetricRow label="Recommended" m={p.result.metrics} />
            <MetricRow label="First come, first served" m={plans.fcfs.result.metrics} base={p.result.metrics} />
            <MetricRow label="Historical rule" m={plans.historical.result.metrics} base={p.result.metrics} />
          </tbody>
        </table>
      </div>
      <p className="sub">Searched {fmtInt(plans.evaluated)} policies. Recommendation only: it does not grant spots, move aircraft, or turn anyone away.</p>
      {decision?.note && <p className="sub">Last note: “{decision.note}”</p>}

      {mode === 'view' && (
        <div className="row">
          <button className="primary" disabled={busy || !serverOk} onClick={() => act('approve', p.policy, p.result.metrics, '')}>Approve</button>
          <button disabled={busy || !serverOk} onClick={() => setMode('edit')}>Edit</button>
          <button disabled={busy || !serverOk} onClick={() => setMode('reject')}>Reject</button>
        </div>
      )}
      {mode === 'edit' && (
        <PolicyEditor data={data} scenario={scenario} initial={decision?.action === 'edit' ? decision.policy : p.policy}
          onCancel={() => setMode('view')} onSave={(pol, m, n) => act('edit', pol, m, n)} />
      )}
      {mode === 'reject' && (
        <div className="editor">
          <label className="block">Why reject? Don't include tail numbers or names.
            <textarea id={`note-reject-${scenario}`} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
          </label>
          <div className="row">
            <button className="danger" disabled={busy} onClick={() => act('reject', p.policy, p.result.metrics, note)}>Reject recommendation</button>
            <button onClick={() => setMode('view')}>Cancel</button>
          </div>
        </div>
      )}
    </article>
  );
}

export function Recommendations({ data, plans, decisions, serverOk, onDecide }: {
  data: AppData; plans: Record<Scenario, ScenarioPlans>; decisions: Decision[]; serverOk: boolean;
  onDecide: (scenario: Scenario, action: Action, policy: Policy, metrics: Metrics, note: string) => Promise<boolean>;
}) {
  const latest = latestDecisions(decisions);
  return (
    <div className="stack">
      <section className="card">
        <h2>Parking policy for each demand level</h2>
        <p className="note">
          Turned away under the recommended plans: low <b>{fmtInt(plans.low.planner.result.metrics.turnedAway)}</b>, likely{' '}
          <b>{fmtInt(plans.likely.planner.result.metrics.turnedAway)}</b>, high <b>{fmtInt(plans.high.planner.result.metrics.turnedAway)}</b>.
          The manager approves, edits, or rejects each plan. Every decision is logged.
        </p>
        {!serverOk && <p className="warn">The approval server isn't running, so decisions can't be saved. Start it with <code>npm run server</code>.</p>}
      </section>
      <div className="recs">
        {PLANNED.map((s) => <Card key={s} data={data} scenario={s} plans={plans[s]} decision={latest[s]} serverOk={serverOk} onDecide={onDecide} />)}
      </div>
      <section className="card">
        <h2>Decision log</h2>
        {decisions.length === 0 ? <p className="note">No decisions yet.</p> : (
          <div className="table-box tall">
            <table>
              <thead><tr><th>Time</th><th>Scenario</th><th>Decision</th><th className="num">Turned away</th><th>Note</th></tr></thead>
              <tbody>
                {decisions.map((d) => (
                  <tr key={d.id}>
                    <td>{new Date(d.ts).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}</td>
                    <td>{LABEL[d.scenario]}</td>
                    <td><span className={'chip ' + d.action}>{STATUS[d.action]}</span></td>
                    <td className="num">{d.metrics?.turnedAway != null ? fmtInt(d.metrics.turnedAway) : '—'}</td>
                    <td className="wrap">{d.note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
