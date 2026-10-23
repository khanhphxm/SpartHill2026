import type { Assignment, Flight, Policy, RefuseReason, SimResult, Size } from './types.ts';
import { SIZES } from './types.ts';
import { HORIZON_HOURS, MAX_WAIT_MIN, NIGHTS, NIGHT_CHECK_MIN, OVERFLOW_AIRPORTS, TURN_BUFFER_MIN, WEIGHTS } from './config.ts';

export interface SimInput {
  flights: Flight[];
  spots: Record<Size, number>;
  weekStart: number;
  policy: Policy;
}

/** Nights (0-based from week start) during which a jet is parked at the night check time. */
export function nightsCovered(start: number, end: number, weekStart: number): number[] {
  const out: number[] = [];
  for (let n = 0; n < NIGHTS; n++) {
    const check = weekStart + (n + 1) * 1440 + NIGHT_CHECK_MIN;
    if (start < check && end > check) out.push(n);
  }
  return out;
}

export const spotId = (size: Size, i: number) => size[0].toUpperCase() + String(i + 1).padStart(2, '0');

/**
 * Replays a week of arrivals in time order under a policy. Each jet gets a spot of
 * its own size class, waits up to MAX_WAIT_MIN for one, or goes to overflow. This is
 * a measurement of the policy; it never books, moves or refuses a real aircraft.
 */
export function simulate({ flights, spots, weekStart, policy }: SimInput): SimResult {
  const freeAt: Record<Size, number[]> = { light: [], midsize: [], heavy: [] };
  for (const s of SIZES) freeAt[s] = new Array(spots[s]).fill(-Infinity);
  const nightCount: Record<Size, number[]> = { light: [], midsize: [], heavy: [] };
  for (const s of SIZES) nightCount[s] = new Array(NIGHTS).fill(0);
  const airportEnds = new Map<string, number[]>(OVERFLOW_AIRPORTS.map((a) => [a.id, []]));
  const airportById = new Map(OVERFLOW_AIRPORTS.map((a) => [a.id, a]));

  const order = [...flights].sort((a, b) => a.arrival - b.arrival || a.id.localeCompare(b.id));
  const assignments: Assignment[] = [];
  let redirectCost = 0;

  for (const f of order) {
    const pool = freeAt[f.size];
    const t = f.arrival;
    const dwell = f.departure - f.arrival;
    let reason: RefuseReason | null = null;
    let nights: number[] = [];

    if (f.stay === 'overnight') {
      const inUse = pool.filter((x) => x > t).length;
      if (pool.length === 0 || inUse / pool.length >= policy.dropAndGoOnlyAt) reason = 'drop_and_go_only';
      else {
        nights = nightsCovered(f.arrival, f.departure, weekStart);
        const caps = policy.overnightCap[f.size];
        if (nights.some((n) => nightCount[f.size][n] >= (caps[n] ?? 0))) reason = 'overnight_cap';
      }
    }

    if (!reason) {
      let best = -1;
      for (let i = 0; i < pool.length; i++) if (best < 0 || pool[i] < pool[best]) best = i;
      const start = best < 0 ? Infinity : Math.max(t, pool[best]);
      if (start - t <= MAX_WAIT_MIN) {
        const end = start + dwell;
        pool[best] = end + TURN_BUFFER_MIN;
        for (const n of nights) nightCount[f.size][n] += 1;
        assignments.push({
          flightId: f.id, size: f.size, stay: f.stay, arrival: f.arrival, departure: f.departure,
          outcome: 'parked', spotId: spotId(f.size, best), start, end, waitMin: start - t, reason: null, airport: null,
        });
        continue;
      }
      reason = 'ramp_full';
    }

    let airport: string | null = null;
    for (const id of policy.overflowOrder) {
      const a = airportById.get(id);
      const ends = airportEnds.get(id);
      if (!a || !ends) continue;
      if (ends.filter((e) => e > t).length < a.capacity) { ends.push(f.departure); airport = id; redirectCost += a.redirectCost; break; }
    }
    assignments.push({
      flightId: f.id, size: f.size, stay: f.stay, arrival: f.arrival, departure: f.departure,
      outcome: airport ? 'redirected' : 'turned_away', spotId: null, start: f.arrival, end: f.departure,
      waitMin: 0, reason, airport,
    });
  }

  // Spots in use at the middle of each hour, by size (difference array over hours).
  const occupancy: Record<Size, number[]> = { light: [], midsize: [], heavy: [] };
  const diff: Record<Size, number[]> = { light: [], midsize: [], heavy: [] };
  for (const s of SIZES) diff[s] = new Array(HORIZON_HOURS + 1).fill(0);
  for (const a of assignments) {
    if (a.outcome !== 'parked') continue;
    const h0 = Math.max(0, Math.ceil((a.start - weekStart - 30) / 60));
    const h1 = Math.min(HORIZON_HOURS, Math.ceil((a.end - weekStart - 30) / 60));
    if (h1 > h0) { diff[a.size][h0] += 1; diff[a.size][h1] -= 1; }
  }
  for (const s of SIZES) {
    let run = 0;
    occupancy[s] = diff[s].slice(0, HORIZON_HOURS).map((d) => (run += d));
  }

  // Empty spot-hours in hours when a jet of that size was refused.
  const refusedHours: Record<Size, Set<number>> = { light: new Set(), midsize: new Set(), heavy: new Set() };
  for (const a of assignments) {
    if (a.outcome === 'parked') continue;
    const h = Math.floor((a.arrival - weekStart) / 60);
    if (h >= 0 && h < HORIZON_HOURS) refusedHours[a.size].add(h);
  }
  let idleWhileRefusing = 0;
  for (const s of SIZES) for (const h of refusedHours[s]) idleWhileRefusing += Math.max(0, spots[s] - occupancy[s][h]);

  let peakRampUse = 0;
  for (let h = 0; h < HORIZON_HOURS; h++) peakRampUse = Math.max(peakRampUse, SIZES.reduce((n, s) => n + occupancy[s][h], 0));

  const parked = assignments.filter((a) => a.outcome === 'parked');
  const redirected = assignments.filter((a) => a.outcome === 'redirected').length;
  const turnedAway = assignments.filter((a) => a.outcome === 'turned_away').length;
  const waitMin = parked.reduce((n, a) => n + a.waitMin, 0);
  const waitHours = waitMin / 60;
  const score = WEIGHTS.turnedAway * turnedAway + redirectCost + WEIGHTS.waitHour * waitHours + WEIGHTS.idleWhileRefusing * idleWhileRefusing;

  return {
    assignments,
    occupancy,
    weekStart,
    metrics: {
      flights: flights.length,
      parked: parked.length,
      redirected,
      turnedAway,
      avgWaitMin: parked.length ? waitMin / parked.length : 0,
      waitHours,
      peakRampUse,
      idleWhileRefusing,
      score,
    },
  };
}
