import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Metrics, Policy, Scenario } from '../core/types.ts';
import { computeAll, latestDecisions, loadData, type Decision, type ScenarioPlans } from './model.ts';
import { Overview } from './views/Overview.tsx';
import { Compare } from './views/Compare.tsx';
import { Schedule } from './views/Schedule.tsx';
import { Recommendations } from './views/Recommendations.tsx';

const TABS = [
  { id: 'overview', label: 'Demand' },
  { id: 'compare', label: 'Compare planners' },
  { id: 'schedule', label: 'Ramp schedule' },
  { id: 'approvals', label: 'Approvals' },
] as const;
type Tab = (typeof TABS)[number]['id'];

const tabFromHash = (): Tab => (TABS.find((t) => '#' + t.id === location.hash)?.id ?? 'overview');

export function App() {
  const data = useMemo(loadData, []);
  const [plans, setPlans] = useState<Record<Scenario, ScenarioPlans> | null>(null);
  const [tab, setTab] = useState<Tab>(tabFromHash);
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [serverOk, setServerOk] = useState(true);
  const [error, setError] = useState('');

  // The planner search takes about a second; let the first frame paint first.
  useEffect(() => { const id = setTimeout(() => setPlans(computeAll(data)), 30); return () => clearTimeout(id); }, [data]);
  useEffect(() => { const f = () => setTab(tabFromHash()); addEventListener('hashchange', f); return () => removeEventListener('hashchange', f); }, []);

  const refresh = useCallback(async () => {
    try {
      const r = await fetch('/api/decisions');
      if (!r.ok) throw new Error(String(r.status));
      setDecisions(await r.json());
      setServerOk(true);
    } catch { setServerOk(false); }
  }, []);
  useEffect(() => { refresh(); }, [refresh]);

  const onDecide = useCallback(async (scenario: Scenario, action: Decision['action'], policy: Policy, metrics: Metrics, note: string) => {
    setError('');
    try {
      const r = await fetch('/api/decisions', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ scenario, action, policy, metrics, note }) });
      if (!r.ok) { setError((await r.json().catch(() => ({}))).error ?? `Save failed (${r.status}).`); return false; }
      await refresh();
      return true;
    } catch {
      setServerOk(false);
      setError('The decision was not saved: the approval server is not reachable.');
      return false;
    }
  }, [refresh]);

  const managerPolicy = useMemo(() => {
    const out: Partial<Record<Scenario, Policy>> = {};
    for (const [s, d] of Object.entries(latestDecisions(decisions)) as [Scenario, Decision][]) if (d.action !== 'reject') out[s] = d.policy;
    return out;
  }, [decisions]);

  return (
    <div className="shell">
      <header className="top">
        <div className="brand">
          {/* hold-short marking: two solid and two dashed bars */}
          <svg className="mark" viewBox="0 0 28 28" aria-hidden="true">
            <rect width="28" height="28" rx="6" fill="var(--ink)" />
            <rect x="5" y="4" width="3" height="20" fill="var(--accent)" />
            <rect x="10" y="4" width="3" height="20" fill="var(--accent)" />
            {[4, 11, 18].map((y) => <g key={y}><rect x="16" y={y} width="3" height="5" fill="var(--accent)" /><rect x="21" y={y} width="3" height="5" fill="var(--accent)" /></g>)}
          </svg>
          <div>
            <h1>HHR ramp planner</h1>
            <p>Super Bowl LXI week, Wed Feb 10 – Tue Feb 16, 2027 · fictional FBO · synthetic data</p>
          </div>
        </div>
        <nav className="tabs" aria-label="Sections">
          {TABS.map((t) => (
            <a key={t.id} href={'#' + t.id} className={tab === t.id ? 'on' : ''} aria-current={tab === t.id ? 'page' : undefined}>{t.label}</a>
          ))}
        </nav>
      </header>
      <main>
        {error && <p className="warn" role="alert">{error}</p>}
        {tab === 'overview' && <Overview data={data} />}
        {tab !== 'overview' && !plans && <div className="card loading">Scoring policies for each scenario…</div>}
        {tab === 'compare' && plans && <Compare plans={plans} />}
        {tab === 'schedule' && plans && <Schedule data={data} plans={plans} managerPolicy={managerPolicy} />}
        {tab === 'approvals' && plans && <Recommendations data={data} plans={plans} decisions={decisions} serverOk={serverOk} onDecide={onDecide} />}
      </main>
      <footer>All numbers come from the forecast and simulation code on synthetic data (data/generate.py). Assumptions: data/ASSUMPTIONS.md.</footer>
    </div>
  );
}
