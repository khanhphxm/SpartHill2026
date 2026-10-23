import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { Flight, Policy } from './types.ts';
import { parseCsv, parseFlights, parseSpots, toMin, weekStartOf } from './data.ts';
import { nightsCovered, simulate } from './simulate.ts';
import { fcfsPolicy, historicalPolicy, plan } from './planner.ts';
import { allowedNumbers, explain, unknownNumbers } from './explain.ts';

const read = (f: string) => readFileSync(new URL(`../data/out/${f}`, import.meta.url), 'utf8');
const spots = parseSpots(read('ramp_spots.csv'));
const WEEK = toMin('2027-02-10T00:00');

const jet = (id: string, arr: string, dep: string, stay: Flight['stay'] = 'overnight', size: Flight['size'] = 'heavy'): Flight =>
  ({ id, scenario: 'likely', arrival: toMin(arr), departure: toMin(dep), size, stay });

test('CSV parser keeps quoted cells with commas', () => {
  const rows = parseCsv('a,b\n1,"x, y"\r\n');
  assert.deepEqual(rows, [{ a: '1', b: 'x, y' }]);
  assert.deepEqual(spots, { light: 25, midsize: 20, heavy: 15 });
});

test('a stay counts for a night when parked at 02:00 next day', () => {
  assert.deepEqual(nightsCovered(toMin('2027-02-10T10:00'), toMin('2027-02-12T09:00'), WEEK), [0, 1]);
  assert.deepEqual(nightsCovered(toMin('2027-02-10T10:00'), toMin('2027-02-10T23:00'), WEEK), []);
});

test('jets wait up to 30 minutes for a spot, then go to overflow', () => {
  const one = { light: 0, midsize: 0, heavy: 1 };
  const flights = [
    jet('A', '2027-02-10T10:00', '2027-02-10T11:00', 'drop_and_go'),
    jet('B', '2027-02-10T10:50', '2027-02-10T11:30', 'drop_and_go'), // spot free 11:10 -> waits 20
    jet('C', '2027-02-10T11:00', '2027-02-10T11:40', 'drop_and_go'), // next free 11:50+10 -> refused
  ];
  const r = simulate({ flights, spots: one, weekStart: WEEK, policy: fcfsPolicy(one) });
  const by = Object.fromEntries(r.assignments.map((a) => [a.flightId, a]));
  assert.equal(by.A.outcome, 'parked');
  assert.equal(by.B.waitMin, 20);
  assert.equal(by.C.outcome, 'redirected');
  assert.equal(by.C.reason, 'ramp_full');
});

test('overnight cap sends extra overnight jets to overflow but keeps drop-and-go', () => {
  const two = { light: 0, midsize: 0, heavy: 2 };
  const policy: Policy = { ...fcfsPolicy(two), overnightCap: { light: [0, 0, 0, 0, 0, 0, 0], midsize: [0, 0, 0, 0, 0, 0, 0], heavy: [1, 1, 1, 1, 1, 1, 1] } };
  const flights = [
    jet('O1', '2027-02-10T10:00', '2027-02-12T10:00'),
    jet('O2', '2027-02-10T11:00', '2027-02-12T10:00'),
    jet('D1', '2027-02-10T12:00', '2027-02-10T13:00', 'drop_and_go'),
  ];
  const r = simulate({ flights, spots: two, weekStart: WEEK, policy });
  const by = Object.fromEntries(r.assignments.map((a) => [a.flightId, a]));
  assert.equal(by.O1.outcome, 'parked');
  assert.equal(by.O2.reason, 'overnight_cap');
  assert.equal(by.D1.outcome, 'parked');
});

test('no spot is double-booked in the likely week', () => {
  const flights = parseFlights(read('flights_likely.csv'));
  const r = simulate({ flights, spots, weekStart: weekStartOf(flights), policy: fcfsPolicy(spots) });
  const bySpot = new Map<string, { start: number; end: number }[]>();
  for (const a of r.assignments) if (a.spotId) (bySpot.get(a.spotId) ?? bySpot.set(a.spotId, []).get(a.spotId)!).push(a);
  for (const list of bySpot.values()) {
    list.sort((x, y) => x.start - y.start);
    for (let i = 1; i < list.length; i++) assert.ok(list[i].start >= list[i - 1].end, 'overlap on one spot');
  }
  assert.equal(r.metrics.parked + r.metrics.redirected + r.metrics.turnedAway, flights.length);
  assert.ok(r.metrics.peakRampUse <= 60);
});

test('the normal week fits the ramp under first come, first served', () => {
  const flights = parseFlights(read('flights_normal.csv'));
  const r = simulate({ flights, spots, weekStart: weekStartOf(flights), policy: fcfsPolicy(spots) });
  assert.equal(r.metrics.turnedAway, 0);
  assert.equal(r.metrics.redirected, 0);
});

test('planner scores no worse than both baselines in every event scenario', () => {
  for (const f of ['flights_low.csv', 'flights_likely.csv', 'flights_high.csv']) {
    const flights = parseFlights(read(f));
    const weekStart = weekStartOf(flights);
    const p = plan(flights, spots, weekStart);
    const fcfs = simulate({ flights, spots, weekStart, policy: fcfsPolicy(spots) });
    const hist = simulate({ flights, spots, weekStart, policy: historicalPolicy(spots) });
    assert.ok(p.result.metrics.score <= fcfs.metrics.score, `${f}: worse than FCFS`);
    assert.ok(p.result.metrics.score <= hist.metrics.score, `${f}: worse than historical`);
  }
});

test('explanation passes the number check, and a made-up number fails it', () => {
  const flights = parseFlights(read('flights_likely.csv'));
  const weekStart = weekStartOf(flights);
  const p = plan(flights, spots, weekStart);
  const input = {
    scenarioLabel: 'likely', policy: p.policy, planner: p.result.metrics,
    fcfs: simulate({ flights, spots, weekStart, policy: fcfsPolicy(spots) }).metrics,
    historical: simulate({ flights, spots, weekStart, policy: historicalPolicy(spots) }).metrics,
  };
  const text = explain(input);
  assert.deepEqual(unknownNumbers(text, allowedNumbers(input)), []);
  assert.deepEqual(unknownNumbers(text + ' About 4,321 more.', allowedNumbers(input)), ['4321']);
});
