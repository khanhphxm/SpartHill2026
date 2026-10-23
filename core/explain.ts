import type { Metrics, Policy } from './types.ts';

// Plain-English reason for a recommendation. For now this is a template filled from
// planner output; the LLM explainer (ARCHITECTURE.md #7) replaces it later and must
// pass the same number check.

const int = (n: number) => Math.round(n).toLocaleString('en-US');
const pct = (n: number) => `${Math.round(n * 100)}%`;

export interface ExplainInput {
  scenarioLabel: string;
  policy: Policy;
  planner: Metrics;
  fcfs: Metrics;
  historical: Metrics;
}

/** Every number the explanation may contain, as text. */
export function allowedNumbers({ policy, planner, fcfs, historical }: ExplainInput): string[] {
  const caps = [policy.overnightCap.light, policy.overnightCap.midsize, policy.overnightCap.heavy].flat();
  return [
    ...caps.map(int),
    pct(Math.min(1, policy.dropAndGoOnlyAt)),
    ...[planner, fcfs, historical].flatMap((m) => [int(m.turnedAway), int(m.redirected), int(m.avgWaitMin), int(m.flights), int(m.peakRampUse)]),
  ];
}

export function explain(input: ExplainInput): string {
  const { scenarioLabel, policy, planner, fcfs, historical } = input;
  const c = policy.overnightCap;
  const sameAll = (xs: number[]) => xs.every((x) => x === xs[0]);
  const capText = [c.light, c.midsize, c.heavy].every(sameAll)
    ? `Hold at most ${int(c.light[0])} light, ${int(c.midsize[0])} midsize and ${int(c.heavy[0])} heavy spots for overnight jets each night`
    : 'Hold overnight spots per the per-night caps shown';
  const trigger = policy.dropAndGoOnlyAt <= 1
    ? `, and switch a size class to drop-and-go only when ${pct(policy.dropAndGoOnlyAt)} of its spots are in use.`
    : '. No drop-and-go-only switch is needed.';
  return [
    `In the ${scenarioLabel} scenario (${int(planner.flights)} jets): ${capText}${trigger}`,
    `In simulation this turns away ${int(planner.turnedAway)} jets, against ${int(fcfs.turnedAway)} under first come, first served and ${int(historical.turnedAway)} under the historical rule.`,
    `${int(planner.redirected)} jets go to overflow airports, and parked jets wait ${int(planner.avgWaitMin)} minutes on average.`,
  ].join(' ');
}

/** Numbers in the text that are not in the allowed list (binding rule 6). Empty means it passes. */
export function unknownNumbers(text: string, allowed: string[]): string[] {
  const norm = (s: string) => s.replace(/,/g, '').replace(/%$/, '');
  const ok = new Set(allowed.map(norm));
  return (text.match(/\d[\d,]*(?:\.\d+)?%?/g) ?? []).map(norm).filter((n) => !ok.has(n));
}
