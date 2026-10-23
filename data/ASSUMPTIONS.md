# Assumptions: synthetic FBO demand, Super Bowl LXI week

All data is **synthetic**. Every number below is either from a public source (marked **[S#]**) or our own assumption (marked **ours**). Change a number in `generate.py` and rerun it to regenerate the data.

## Setting
| ID | Assumption | Value | Basis |
|---|---|---|---|
| A1 | Event window | Wed 2027-02-10 to Tue 2027-02-16; game Sun 2/14, 3:30 PM PT | Game date [S1]. The 7-day window is from the track brief. Game time is assumed to match 2022 [S3]. |
| A1b | Game ends | Sun 7:30 PM PT | ours (kickoff + about 4 h) |
| A2 | Normal baseline week | Same weekdays, 4 weeks earlier (Jan 13–19, 2027) | ours |
| A3 | Our FBO's ramp | 60 spots: 25 light, 20 midsize, 15 heavy | **ours**. A fictional single FBO at a Hawthorne-like airport. The 2022 regional total was about 750 spots across 5 airports [S2]. |
| A4 | Fleet mix | Normal 45/35/20 light/mid/heavy; event 30/35/35 | ours (event traffic skews to bigger jets) |

## Demand
| ID | Assumption | Value | Basis |
|---|---|---|---|
| A5 | Normal arrivals/day | 18–32 by weekday (about 160/week) | ours |
| A6 | Normal hourly shape | Daytime, peaks 8–9 AM and 3–4 PM | ours |
| A7 | Event arrivals at our FBO (7 days) | low 650 / likely 900 / high 1,100 | Anchored on the Hawthorne FBO planning for 850–1,100 aircraft in 2022 [S4]. The region saw about 1,500 extra jets [S2]. Low = weak matchup and economy. High = big-market teams. |
| A8 | Event arrivals by day (Wed→Tue) | 10/18/24/24/16/5/3 % | Wed–Sat peak, especially Saturday [S3]; most arrive 2–3 days before the game [S2] |
| A9 | Event hourly shape | Wed–Sat peak 10 AM–6 PM; Sun peak 9 AM–2 PM | NBAA 2022 peak arrival windows [S3] |
| A10 | Drop-and-go share | Normal 25%; event 40%. Any arrival after the game = drop-and-go. | ours. The FAA pushed drop-and-go in 2022 [S2][S3]. |
| A11 | Stay length | Drop-and-go 30–75 min; normal overnight 1–3 nights | ours |
| A12 | Event overnight departures | 55% Sun 8 PM–3 AM, 35% Mon 7 AM–8 PM, 10% Tue | NBAA peak departure windows [S3]; LA Times "8 PM Sunday to 2 AM Monday" [S2] |

## Disruption scenario
| ID | Assumption | Value | Basis |
|---|---|---|---|
| A13 | Fog ground stop | Sat 2/13, 6–11 AM. Arrivals in that window slip to 11 AM–3 PM. | ours. LA marine-layer fog is plausible in February. FAA ground stops and delay programs are expected during the event [S3]. |

## What the numbers mean
- `demand_*` in `hourly.csv` = jets that **want** a spot of that size in that hour, **if nobody is turned away**. It is deliberately uncapped.
- `over_*` = demand minus spots. This overflow is the problem the tool plans for, by deciding when to switch to drop-and-go only, which spots to hold, and where to send overflow jets.
- In the likely scenario, uncapped demand peaks around 500 jets against 60 spots. That isn't a forecast of what will park. It shows why "first come, first served" fails.

## Known limits (say these in the pitch)
- There is no public hourly data for any real FBO. The shapes are ours, anchored to 2022 aggregates.
- One fictional FBO, not a real airport layout.
- No weather, slot-allocation, or price effects except the single fog scenario.
- No personal data. Records are tail-free (no registrations, owners or passengers).

## Sources
- [S1] Discover Los Angeles, Super Bowl LXI: https://www.discoverlosangeles.com/event/2027/02/14/super-bowl-lxi
- [S2] LA Times, Feb 11 2022: https://www.latimes.com/business/story/2022-02-11/super-bowl-2022-private-jets-traffic-faa-fbo-reservation-system
- [S3] NBAA, Super Bowl LVI (LA): https://nbaa.org/aircraft-operations/airspace/regional/super-bowl-lvi/
- [S4] Business Insider, Hawthorne prep, Feb 2022: https://www.businessinsider.com/how-a-california-airport-preparing-for-super-bowl-traffic-2022-2

## Files (`data/out/`)
- `flights_<scenario>.csv`: one row per jet visit (arrival, departure, size class, stay type). Scenarios: normal, low, likely, high, likely_fog.
- `hourly.csv`: arrivals, departures, and demand vs. spots per size class, for each hour of each scenario.
- `ramp_spots.csv`: spot counts and example jet types per class.
- `likely` and `likely_fog` contain the same 908 visits. Only arrivals inside the fog window are moved, so the two are directly comparable. Flight IDs are assigned after sorting by time, so they don't line up across the two files.
