# AGENTS.md

## Project

This repository is for SpartHill Hacks 2026, NCBAA aviation track "The Intelligent FBO". The team selected the **parking** focus.

The product is a planning tool for a fictional FBO at Hawthorne Airport (HHR), near SoFi Stadium. It forecasts private-jet parking demand for Super Bowl LXI week (Wed 2027-02-10 to Tue 2027-02-16). It recommends a parking policy for low, medium, and high demand. A human manager approves, edits, or rejects each recommendation.

## Documents

Read these before you change code:

1. `docs/brief/intelligent-fbo.md`: the track requirements and judging lens. This is the source of truth for scope.
2. `docs/ARCHITECTURE.md`: the components, the data flow, the binding rules, and the diagram.
3. `data/ASSUMPTIONS.md`: every number in the synthetic data, with its source or the label "ours".
4. `docs/brief/*.pdf`: the original organizer documents.

## Binding rules

These rules come from the brief. Do not break them.

1. The tool gives recommendations only. It must not grant slots, move aircraft, or reject a customer.
2. Each recommendation goes through a human approval step (approve, edit, or reject). Log each decision.
3. Show the low, medium, and high range where a forecast number appears.
4. Do not store or show personal data: no tail numbers, owner names, or passenger names.
5. The LLM must not produce numbers. Forecast and planner code produce all numbers. The LLM only parses request text and writes explanations.
6. If an explanation contains a number that is not in the planner output, reject the explanation.

## Data

- `data/generate.py` makes all synthetic data. It uses the Python standard library only. Run `python3 data/generate.py`. The output goes to `data/out/`.
- Do not edit files in `data/out/` by hand. Change `generate.py`, then run it again.
- If you add or change a number in `generate.py`, add or change the matching line in `data/ASSUMPTIONS.md`.
- The data is synthetic. Do not call it real data in the UI or in the pitch text.

## Stack
TBD

## Build order
TBD

## Work rules

- Do only the requested task. Keep the demo in working condition at all times.
- Do not add features that are not in `docs/ARCHITECTURE.md`. Tell the user about a good idea, then continue the current task.
- Do not push, deploy, or change external services without permission from the user.
- Do not say that a check passed if you did not run it and see the result.

## Completion report

Give only this information:

1. The changes.
2. The checks that you ran, with the commands and the results.
3. The items that you did not verify, or that are blocked.
