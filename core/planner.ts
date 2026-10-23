import type { Flight, PlannerKind, Policy, SimResult, Size } from './types.ts';
import { SIZES } from './types.ts';
import { HIST_DROP_AND_GO_SHARE, NIGHTS, OVERFLOW_AIRPORTS, TRIGGER_OPTIONS } from './config.ts';
import { simulate } from './simulate.ts';

const DEFAULT_ORDER = OVERFLOW_AIRPORTS.map((a) => a.id);

const uniformCaps = (caps: Record<Size, number>): Record<Size, number[]> => ({
  light: new Array(NIGHTS).fill(caps.light),
  midsize: new Array(NIGHTS).fill(caps.midsize),
  heavy: new Array(NIGHTS).fill(caps.heavy),
});

/** Baseline (a): first come, first served. No caps, no trigger. */
export function fcfsPolicy(spots: Record<Size, number>): Policy {
  return { overnightCap: uniformCaps(spots), dropAndGoOnlyAt: 1.01, overflowOrder: [...DEFAULT_ORDER] };
}

/**
 * Baseline (b): historical-average rule. Keeps the normal-week drop-and-go share of
 * each class free for turns, every night. A proxy until the 2022 reference curve exists.
 */
export function historicalPolicy(spots: Record<Size, number>): Policy {
  const cap = (n: number) => Math.round(n * (1 - HIST_DROP_AND_GO_SHARE));
  return {
    overnightCap: uniformCaps({ light: cap(spots.light), midsize: cap(spots.midsize), heavy: cap(spots.heavy) }),
    dropAndGoOnlyAt: 1.01,
    overflowOrder: [...DEFAULT_ORDER],
  };
}

function permutations<T>(xs: T[]): T[][] {
  if (xs.length <= 1) return [xs];
  return xs.flatMap((x, i) => permutations([...xs.slice(0, i), ...xs.slice(i + 1)]).map((p) => [x, ...p]));
}

export interface PlanResult {
  policy: Policy;
  result: SimResult;
  /** How many policies the search scored. */
  evaluated: number;
}

/**
 * Searches policy settings for the lowest simulator score: a uniform overnight cap
 * per size (coordinate descent over 0–100% of spots), the drop-and-go-only trigger,
 * then the overflow order.
 */
export function plan(flights: Flight[], spots: Record<Size, number>, weekStart: number): PlanResult {
  let evaluated = 0;
  const run = (policy: Policy) => { evaluated++; return simulate({ flights, spots, weekStart, policy }); };

  let best: { policy: Policy; result: SimResult } | null = null;
  for (const trigger of TRIGGER_OPTIONS) {
    const caps: Record<Size, number> = { ...spots };
    let local = run({ overnightCap: uniformCaps(caps), dropAndGoOnlyAt: trigger, overflowOrder: [...DEFAULT_ORDER] });
    for (let pass = 0; pass < 2; pass++) {
      for (const s of SIZES) {
        const options = [...new Set(Array.from({ length: 11 }, (_, i) => Math.round((spots[s] * i) / 10)))];
        for (const c of options) {
          if (c === caps[s]) continue;
          const trial = { ...caps, [s]: c };
          const r = run({ overnightCap: uniformCaps(trial), dropAndGoOnlyAt: trigger, overflowOrder: [...DEFAULT_ORDER] });
          if (r.metrics.score < local.metrics.score) { local = r; caps[s] = c; }
        }
      }
    }
    const policy = { overnightCap: uniformCaps(caps), dropAndGoOnlyAt: trigger, overflowOrder: [...DEFAULT_ORDER] };
    if (!best || local.metrics.score < best.result.metrics.score) best = { policy, result: local };
  }
  if (!best) throw new Error('No policy evaluated');

  for (const order of permutations(DEFAULT_ORDER)) {
    const policy: Policy = { ...best.policy, overflowOrder: order };
    const r = run(policy);
    if (r.metrics.score < best.result.metrics.score) best = { policy, result: r };
  }
  return { ...best, evaluated };
}

export function policyFor(kind: PlannerKind, flights: Flight[], spots: Record<Size, number>, weekStart: number): Policy {
  if (kind === 'fcfs') return fcfsPolicy(spots);
  if (kind === 'historical') return historicalPolicy(spots);
  return plan(flights, spots, weekStart).policy;
}
