// Shared types for the forecast, planner and simulator. All times are minutes since
// the Unix epoch, read from the local Pacific wall-clock strings in data/out as if UTC.

export type Size = 'light' | 'midsize' | 'heavy';
export const SIZES: readonly Size[] = ['light', 'midsize', 'heavy'];

export type StayType = 'drop_and_go' | 'overnight';

export type Scenario = 'normal' | 'low' | 'likely' | 'likely_fog' | 'high';
export const SCENARIOS: readonly Scenario[] = ['normal', 'low', 'likely', 'likely_fog', 'high'];

/** One jet visit. No tail number, owner or passenger: the id is synthetic. */
export interface Flight {
  id: string;
  scenario: Scenario;
  arrival: number;
  departure: number;
  size: Size;
  stay: StayType;
}

export interface Airport {
  id: string;
  name: string;
  /** Jets this airport takes from us at the same time, any size. */
  capacity: number;
  /** Score cost of sending one jet here, relative to the others. */
  redirectCost: number;
}

/**
 * The settings the planner searches over. A policy is a recommendation for the
 * manager; the simulator only measures what would happen under it.
 */
export interface Policy {
  /** Most overnight jets of each size parked on each night of the week (index 0 = first night). */
  overnightCap: Record<Size, number[]>;
  /**
   * When this share of a size class's spots is in use, new overnight jets of that
   * size are sent to overflow (drop-and-go only). Above 1 means never.
   */
  dropAndGoOnlyAt: number;
  /** Overflow airport ids, tried in this order. */
  overflowOrder: string[];
}

export type Outcome = 'parked' | 'redirected' | 'turned_away';
export type RefuseReason = 'overnight_cap' | 'drop_and_go_only' | 'ramp_full';

export interface Assignment {
  flightId: string;
  size: Size;
  stay: StayType;
  arrival: number;
  departure: number;
  outcome: Outcome;
  /** Set when parked. */
  spotId: string | null;
  /** Parked interval, after any wait. */
  start: number;
  end: number;
  waitMin: number;
  reason: RefuseReason | null;
  airport: string | null;
}

export interface Metrics {
  flights: number;
  parked: number;
  redirected: number;
  turnedAway: number;
  avgWaitMin: number;
  waitHours: number;
  /** Most of our spots in use at the same time, all sizes. */
  peakRampUse: number;
  /** Spot-hours left empty in hours when a jet of that size was refused. */
  idleWhileRefusing: number;
  score: number;
}

export interface SimResult {
  assignments: Assignment[];
  metrics: Metrics;
  /** Spots in use at the middle of each hour from week start, per size. */
  occupancy: Record<Size, number[]>;
  weekStart: number;
}

export type PlannerKind = 'fcfs' | 'historical' | 'planner';
