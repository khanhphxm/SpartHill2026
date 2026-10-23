import type { Airport } from './types.ts';

// Planner and simulator settings. Every number here is listed in data/ASSUMPTIONS.md (P1–P8).

/** P1: nights in the planning week (Wed through Tue). */
export const NIGHTS = 7;

/** P2: a jet "stays the night" if it is parked at 02:00 the next morning. */
export const NIGHT_CHECK_MIN = 2 * 60;

/** P3: longest a jet waits on the ground or holds for a free spot before it is refused. */
export const MAX_WAIT_MIN = 30;

/** P4: time to clear and re-use a spot after a jet leaves. */
export const TURN_BUFFER_MIN = 10;

/** P5: fictional overflow airports that take our referrals. */
export const OVERFLOW_AIRPORTS: readonly Airport[] = [
  { id: 'A', name: 'Overflow airport A', capacity: 40, redirectCost: 1 },
  { id: 'B', name: 'Overflow airport B', capacity: 30, redirectCost: 1.5 },
  { id: 'C', name: 'Overflow airport C', capacity: 30, redirectCost: 2 },
];

/** P6: score weights. Lower score is better. A redirect costs its airport's redirectCost. */
export const WEIGHTS = { turnedAway: 10, waitHour: 0.5, idleWhileRefusing: 0.2 } as const;

/** P7: historical-average rule keeps the normal-week drop-and-go share of spots free (A10). */
export const HIST_DROP_AND_GO_SHARE = 0.25;

/** P8: drop-and-go-only trigger levels the planner tries. Above 1 means off. */
export const TRIGGER_OPTIONS: readonly number[] = [0.7, 0.8, 0.9, 1.01];

/** Hours tracked after week start: the week plus two days of departures. */
export const HORIZON_HOURS = NIGHTS * 24 + 48;
