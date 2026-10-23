"""Synthetic demand data for one LA-area FBO, Super Bowl LXI week.

Stdlib only. Deterministic (fixed seed). Every number comes from ASSUMPTIONS.md.
Run: python3 data/generate.py   -> writes CSVs into data/out/
"""
import csv
import random
from datetime import datetime, timedelta
from pathlib import Path

SEED = 61
OUT = Path(__file__).parent / "out"

# A1: event window = Wed 2027-02-10 00:00 to Tue 2027-02-16 23:59 (game Sun 2/14 15:30 PT)
EVENT_START = datetime(2027, 2, 10)
# A2: normal baseline week = same weekdays, four weeks earlier (no events)
NORMAL_START = EVENT_START - timedelta(weeks=4)
DAYS = 7

# A3: ramp spots at our FBO, by size class
SPOTS = {"light": 25, "midsize": 20, "heavy": 15}
# A4: fleet mix (share of arrivals)
MIX_NORMAL = {"light": 0.45, "midsize": 0.35, "heavy": 0.20}
MIX_EVENT = {"light": 0.30, "midsize": 0.35, "heavy": 0.35}

# A5: normal arrivals per day by weekday (Mon=0)
NORMAL_PER_DAY = {0: 22, 1: 20, 2: 20, 3: 26, 4: 32, 5: 18, 6: 24}
# A6: normal hourly arrival shape (local hour weights)
NORMAL_HOUR = [0, 0, 0, 0, 0, 1, 3, 6, 8, 8, 7, 6, 6, 6, 7, 8, 8, 7, 5, 4, 3, 2, 1, 0]

# A7: event-week arrivals at this FBO over the 7 days, per scenario
EVENT_TOTAL = {"low": 650, "likely": 900, "high": 1100}
# A8: share of event arrivals per day (Wed..Tue)
EVENT_DAY_SHARE = [0.10, 0.18, 0.24, 0.24, 0.16, 0.05, 0.03]
# A9: event hourly arrival shape: Wed-Sat peak 10-18, Sun peak 09-14
EVENT_HOUR_WEEK = [0, 0, 0, 0, 0, 1, 2, 4, 6, 8, 10, 11, 11, 11, 11, 10, 10, 9, 6, 4, 3, 2, 1, 0]
EVENT_HOUR_SUN = [0, 0, 0, 0, 0, 1, 3, 5, 8, 12, 13, 13, 12, 10, 6, 2, 1, 1, 1, 1, 0, 0, 0, 0]
# A10: stay type shares
DROPGO_NORMAL = 0.25
DROPGO_EVENT = 0.40
# A11: drop-and-go turn time 30-75 min; normal overnight stay 1-3 nights
# A12: event overnight jets leave after the game: Sun 20:00-03:00 (55%), Mon 07:00-20:00 (35%), Tue (10%)
GAME_END = datetime(2027, 2, 14, 19, 30)

# A13: disruption = fog ground stop Sat 2/13 06:00-11:00; those arrivals land 11:00-15:00 instead
FOG_START = datetime(2027, 2, 13, 6)
FOG_END = datetime(2027, 2, 13, 11)


def pick(rng, weights: dict):
    return rng.choices(list(weights), list(weights.values()))[0]


def hour_in_day(rng, day: datetime, shape):
    h = rng.choices(range(24), shape)[0]
    return day + timedelta(hours=h, minutes=rng.randrange(60))


def event_departure(rng, arr: datetime) -> datetime:
    r = rng.random()
    if r < 0.55:
        dep = GAME_END + timedelta(minutes=30 + rng.randrange(7 * 60))  # Sun 20:00-03:00
    elif r < 0.90:
        dep = datetime(2027, 2, 15, 7) + timedelta(minutes=rng.randrange(13 * 60))
    else:
        dep = datetime(2027, 2, 16, 7) + timedelta(minutes=rng.randrange(12 * 60))
    return max(dep, arr + timedelta(hours=2))


def flights(rng, scenario: str):
    rows = []
    if scenario == "normal":
        for d in range(DAYS):
            day = NORMAL_START + timedelta(days=d)
            n = max(0, round(rng.gauss(NORMAL_PER_DAY[day.weekday()], 3)))
            for _ in range(n):
                arr = hour_in_day(rng, day, NORMAL_HOUR)
                size = pick(rng, MIX_NORMAL)
                if rng.random() < DROPGO_NORMAL:
                    stay, dep = "drop_and_go", arr + timedelta(minutes=rng.randint(30, 75))
                else:
                    stay = "overnight"
                    dep = arr + timedelta(days=rng.randint(1, 3), hours=rng.uniform(-4, 4))
                rows.append((arr, dep, size, stay))
        return rows

    base = "likely" if scenario == "likely_fog" else scenario
    total = EVENT_TOTAL[base]
    for d in range(DAYS):
        day = EVENT_START + timedelta(days=d)
        n = max(0, round(rng.gauss(total * EVENT_DAY_SHARE[d], total * EVENT_DAY_SHARE[d] * 0.05)))
        shape = EVENT_HOUR_SUN if day.weekday() == 6 else EVENT_HOUR_WEEK
        for _ in range(n):
            arr = hour_in_day(rng, day, shape)
            fog_shift = rng.randrange(4 * 60)  # always drawn so likely and likely_fog share flights
            if scenario == "likely_fog" and FOG_START <= arr < FOG_END:
                arr = FOG_END + timedelta(minutes=fog_shift)
            size = pick(rng, MIX_EVENT)
            if rng.random() < DROPGO_EVENT or arr > GAME_END:
                stay, dep = "drop_and_go", arr + timedelta(minutes=rng.randint(30, 75))
            else:
                stay, dep = "overnight", event_departure(rng, arr)
            rows.append((arr, dep, size, stay))
    return rows


def write_flights(scenario, rows):
    rows.sort()
    path = OUT / f"flights_{scenario}.csv"
    with path.open("w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["flight_id", "scenario", "arrival", "departure", "size_class", "stay_type"])
        for i, (a, dpt, s, st) in enumerate(rows, 1):
            w.writerow([f"{scenario[:3].upper()}-{i:04d}", scenario, a.isoformat(timespec="minutes"),
                        dpt.isoformat(timespec="minutes"), s, st])


def hourly(scenario, rows, start):
    """Arrivals, departures and ramp demand per hour (demand = jets wanting a spot, uncapped)."""
    out = []
    for h in range(DAYS * 24):
        t0 = start + timedelta(hours=h)
        t1 = t0 + timedelta(hours=1)
        rec = {"scenario": scenario, "hour": t0.isoformat(timespec="minutes"),
               "arrivals": sum(t0 <= a < t1 for a, _, _, _ in rows),
               "departures": sum(t0 <= d < t1 for _, d, _, _ in rows)}
        for size, cap in SPOTS.items():
            demand = sum(a < t1 and d > t0 and s == size for a, d, s, _ in rows)
            rec[f"demand_{size}"] = demand
            rec[f"spots_{size}"] = cap
            rec[f"over_{size}"] = max(0, demand - cap)
        out.append(rec)
    return out


def main():
    OUT.mkdir(exist_ok=True)
    all_hourly, summary = [], []
    for i, scenario in enumerate(["normal", "low", "likely", "high", "likely_fog"]):
        rng = random.Random(SEED + (2 if scenario == "likely_fog" else i))  # fog reuses likely's seed
        rows = flights(rng, scenario)
        write_flights(scenario, rows)
        start = NORMAL_START if scenario == "normal" else EVENT_START
        hrs = hourly(scenario, rows, start)
        all_hourly += hrs
        over_hours = sum(any(r[f"over_{s}"] for s in SPOTS) for r in hrs)
        summary.append((scenario, len(rows), max(r["arrivals"] for r in hrs),
                        max(r["departures"] for r in hrs), over_hours))
    with (OUT / "hourly.csv").open("w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=list(all_hourly[0]))
        w.writeheader()
        w.writerows(all_hourly)
    with (OUT / "ramp_spots.csv").open("w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["size_class", "spots", "example_types"])
        w.writerows([["light", 25, "Phenom 300, Citation CJ3, King Air 350"],
                     ["midsize", 20, "Challenger 350, Praetor 600, Citation Latitude"],
                     ["heavy", 15, "G650, Global 6000, Falcon 7X"]])
    print(f"{'scenario':<11} {'arrivals':>8} {'peak arr/h':>10} {'peak dep/h':>10} {'hours over cap':>14}")
    for s in summary:
        print(f"{s[0]:<11} {s[1]:>8} {s[2]:>10} {s[3]:>10} {s[4]:>14}")


if __name__ == "__main__":
    main()
