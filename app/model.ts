import flightsNormal from '../data/out/flights_normal.csv?raw';
import flightsLow from '../data/out/flights_low.csv?raw';
import flightsLikely from '../data/out/flights_likely.csv?raw';
import flightsFog from '../data/out/flights_likely_fog.csv?raw';
import flightsHigh from '../data/out/flights_high.csv?raw';
import hourlyCsv from '../data/out/hourly.csv?raw';
import rampCsv from '../data/out/ramp_spots.csv?raw';
import type { Flight, Metrics, PlannerKind, Policy, Scenario, SimResult, Size } from '../core/types.ts';
import { SIZES } from '../core/types.ts';
import { parseCsv, parseFlights, parseSpots, toMin, weekStartOf } from '../core/data.ts';
import { simulate } from '../core/simulate.ts';
import { fcfsPolicy, historicalPolicy, plan } from '../core/planner.ts';

export const LABEL: Record<Scenario, string> = {
  normal: 'Normal week', low: 'Low', likely: 'Likely', likely_fog: 'Likely + fog', high: 'High',
};
export const PLANNER_LABEL: Record<PlannerKind | 'manager', string> = {
  fcfs: 'First come, first served', historical: 'Historical-average rule', planner: 'Recommended plan', manager: 'Manager-approved plan',
};
/** Scenarios that get their own recommendation card. */
export const PLANNED: readonly Scenario[] = ['low', 'likely', 'high'];
export const COMPARED: readonly Scenario[] = ['normal', 'low', 'likely', 'likely_fog', 'high'];

export interface ScenarioData { flights: Flight[]; weekStart: number }
export interface HourRow { scenario: Scenario; t: number; demand: Record<Size, number>; spots: Record<Size, number>; arrivals: number }

export interface AppData {
  scenarios: Record<Scenario, ScenarioData>;
  spots: Record<Size, number>;
  totalSpots: number;
  hourly: HourRow[];
  rampTypes: { size: Size; spots: number; examples: string }[];
}

export function loadData(): AppData {
  const raw: Record<Scenario, string> = { normal: flightsNormal, low: flightsLow, likely: flightsLikely, likely_fog: flightsFog, high: flightsHigh };
  const scenarios = {} as Record<Scenario, ScenarioData>;
  for (const [k, text] of Object.entries(raw) as [Scenario, string][]) {
    const flights = parseFlights(text);
    scenarios[k] = { flights, weekStart: weekStartOf(flights) };
  }
  const spots = parseSpots(rampCsv);
  const hourly = parseCsv(hourlyCsv).map((r) => ({
    scenario: r.scenario as Scenario,
    t: toMin(r.hour),
    arrivals: Number(r.arrivals),
    demand: { light: Number(r.demand_light), midsize: Number(r.demand_midsize), heavy: Number(r.demand_heavy) },
    spots: { light: Number(r.spots_light), midsize: Number(r.spots_midsize), heavy: Number(r.spots_heavy) },
  }));
  const rampTypes = parseCsv(rampCsv).map((r) => ({ size: r.size_class as Size, spots: Number(r.spots), examples: r.example_types }));
  return { scenarios, spots, totalSpots: SIZES.reduce((n, s) => n + spots[s], 0), hourly, rampTypes };
}

export interface Evaluated { policy: Policy; result: SimResult }
export interface ScenarioPlans {
  fcfs: Evaluated;
  historical: Evaluated;
  planner: Evaluated;
  /** The scenario whose plan is replayed here (fog replays the likely plan). */
  planFor: Scenario;
  evaluated: number;
}

export function runPolicy(data: AppData, scenario: Scenario, policy: Policy): SimResult {
  const { flights, weekStart } = data.scenarios[scenario];
  return simulate({ flights, spots: data.spots, weekStart, policy });
}

/** Scores both baselines and the planner on every scenario. */
export function computeAll(data: AppData): Record<Scenario, ScenarioPlans> {
  const out = {} as Record<Scenario, ScenarioPlans>;
  const planned = {} as Partial<Record<Scenario, { policy: Policy; evaluated: number }>>;
  for (const s of ['normal', 'low', 'likely', 'high'] as Scenario[]) {
    const { flights, weekStart } = data.scenarios[s];
    const p = plan(flights, data.spots, weekStart);
    planned[s] = { policy: p.policy, evaluated: p.evaluated };
  }
  for (const s of COMPARED) {
    const planFor: Scenario = s === 'likely_fog' ? 'likely' : s;
    const p = planned[planFor]!;
    const fcfs = fcfsPolicy(data.spots);
    const historical = historicalPolicy(data.spots);
    out[s] = {
      fcfs: { policy: fcfs, result: runPolicy(data, s, fcfs) },
      historical: { policy: historical, result: runPolicy(data, s, historical) },
      planner: { policy: p.policy, result: runPolicy(data, s, p.policy) },
      planFor,
      evaluated: p.evaluated,
    };
  }
  return out;
}

export interface Decision {
  id: number;
  ts: string;
  scenario: Scenario;
  action: 'approve' | 'edit' | 'reject';
  policy: Policy;
  metrics: Metrics;
  note: string;
}

/** Latest decision per scenario. */
export function latestDecisions(decisions: Decision[]): Partial<Record<Scenario, Decision>> {
  const out: Partial<Record<Scenario, Decision>> = {};
  for (const d of [...decisions].sort((a, b) => a.id - b.id)) out[d.scenario] = d;
  return out;
}

// Formatting
const nf = new Intl.NumberFormat('en-US');
export const fmtInt = (n: number) => nf.format(Math.round(n));
export const fmtPct = (n: number) => `${Math.round(n * 100)}%`;
export const fmtMin1 = (n: number) => n.toFixed(1);
const dt = (min: number) => new Date(min * 60000);
export const fmtTime = (min: number) => {
  const d = dt(min);
  const h = d.getUTCHours();
  const mm = d.getUTCMinutes();
  const day = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });
  return `${day}, ${h % 12 || 12}${mm ? ':' + String(mm).padStart(2, '0') : ''} ${h < 12 ? 'AM' : 'PM'}`;
};
export const fmtDay = (min: number) => dt(min).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });
export const fmtWeekday = (min: number) => dt(min).toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' });
export const SIZE_LABEL: Record<Size, string> = { light: 'Light', midsize: 'Midsize', heavy: 'Heavy' };
export const triggerText = (x: number) => (x > 1 ? 'Off' : `${fmtPct(x)} of spots in use`);
