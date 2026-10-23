import type { Flight, Scenario, Size, StayType } from './types.ts';
import { SIZES } from './types.ts';

/** Parses the CSV files from data/generate.py. Handles quoted cells with commas. */
export function parseCsv(text: string): Record<string, string>[] {
  const lines = text.trim().split(/\r?\n/);
  const header = splitLine(lines[0]);
  return lines.slice(1).filter((l) => l.length).map((l) => {
    const cells = splitLine(l);
    return Object.fromEntries(header.map((h, i) => [h, cells[i] ?? '']));
  });
}

function splitLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quoted) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') quoted = false;
      else cur += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { out.push(cur); cur = ''; }
    else cur += c;
  }
  out.push(cur);
  return out;
}

/** "2027-02-10T05:16" -> minutes since epoch, wall clock read as UTC. */
export function toMin(s: string): number {
  const ms = Date.parse(s + ':00Z');
  if (Number.isNaN(ms)) throw new Error(`Bad time: ${s}`);
  return ms / 60000;
}

export function parseFlights(text: string): Flight[] {
  return parseCsv(text).map((r) => {
    if (!SIZES.includes(r.size_class as Size)) throw new Error(`Bad size class: ${r.size_class}`);
    return {
      id: r.flight_id,
      scenario: r.scenario as Scenario,
      arrival: toMin(r.arrival),
      departure: toMin(r.departure),
      size: r.size_class as Size,
      stay: r.stay_type as StayType,
    };
  });
}

export function parseSpots(text: string): Record<Size, number> {
  const spots = { light: 0, midsize: 0, heavy: 0 };
  for (const r of parseCsv(text)) spots[r.size_class as Size] = Number(r.spots);
  return spots;
}

/** Midnight of the first arrival day. */
export function weekStartOf(flights: Flight[]): number {
  const first = Math.min(...flights.map((f) => f.arrival));
  return Math.floor(first / 1440) * 1440;
}
