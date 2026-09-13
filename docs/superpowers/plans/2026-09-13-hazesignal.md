# HazeSignal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a readable TypeScript research repository that tests fire-and-wind signals against later PM2.5 in Kuala Lumpur.

**Architecture:** Three command-line fetchers save source data as CSV. Shared analysis functions aggregate, join, regress, and render a plot for a TypeScript Jupyter notebook and a reproducible command-line run.

**Tech Stack:** Node.js 20, TypeScript, tsx, csv-parse/csv-stringify, dotenv, Deno Jupyter kernel

**Spec:** `docs/superpowers/specs/2026-09-13-hazesignal-design.md`

## Global Constraints

- Use only free data access: FIRMS and OpenAQ free keys, Open-Meteo without a key.
- Never commit API keys or invented observations.
- Keep calculations visible and understandable to a new JavaScript programmer.
- Build a repository and notebook only; no web app, dashboard, or deployment.
- Commit each independently useful stage.

---

### Task 1: Data collection

**Files:** Create `package.json`, `tsconfig.json`, `.gitignore`, `.env.example`, `src/csv.ts`, `src/fetch_firms.ts`, `src/fetch_wind.ts`, `src/fetch_pm25.ts`, `test/hazesignal.test.ts`, and `data/README.md`.

**Interfaces:** Produce `fetchFirms(startDate, dayRange)`, `fetchWind(startDate, endDate)`, and `fetchPm25(startDate, endDate)` plus typed CSV helpers.

- [ ] Write a Node test that parses a quoted CSV value and rejects an invalid date range.
- [ ] Run `npm test` and confirm the new assertions fail before implementation.
- [ ] Implement native-fetch collectors with environment validation, response validation, and CSV output.
- [ ] Run `npm test` and `npm run typecheck`.
- [ ] Commit as `feat: add environmental data fetchers`.

### Task 2: Wind alignment

**Files:** Create `src/analysis.ts`; extend `test/hazesignal.test.ts`; add the openly retrievable wind sample to `data/wind_2019-09.csv`.

**Interfaces:** Produce `initialBearing`, `windTravelBearing`, `alignmentScore`, and `dailyWind`.

- [ ] Add assertions for cardinal bearings, meteorological direction conversion, aligned/opposed winds, and vector averaging across north.
- [ ] Run `npm test` and confirm the wind assertions fail.
- [ ] Implement the smallest transparent trigonometric functions and daily vector aggregation.
- [ ] Pull September 2019 Open-Meteo data and save the daily CSV.
- [ ] Run tests and commit as `feat: calculate wind alignment`.

### Task 3: Lagged regression

**Files:** Extend `src/analysis.ts` and `test/hazesignal.test.ts`; create `src/run_analysis.ts`.

**Interfaces:** Produce `combineDailyData`, `linearRegression`, and `scatterSvg`; the runner writes `data/combined.csv`, `data/regression.svg`, and prints statistics.

- [ ] Add a small exact test for the lag join and a perfect-line regression.
- [ ] Run `npm test` and confirm the new assertions fail.
- [ ] Implement daily hotspot counts, aligned-hotspot score, PM2.5 leads, ordinary least squares, and dependency-free SVG rendering.
- [ ] Run `npm test`, `npm run typecheck`, and `npm run analyze` against samples.
- [ ] Commit as `feat: add lagged haze regression`.

### Task 4: Research notebook and documentation

**Files:** Create `notebooks/01_analysis.ipynb` and `README.md`; finish sample provenance in `data/README.md`.

**Interfaces:** The notebook imports analysis helpers, displays intermediate tables/calculations, and reports the same statistics as the runner.

- [ ] Add Markdown and TypeScript cells for hypothesis, source pulls, vector calculation, join, regression plot, and honest interpretation.
- [ ] Document free key registration, setup, commands, notebook kernel installation, source coverage, and limitations.
- [ ] Run `npm test`, `npm run typecheck`, `npm run analyze`, and validate notebook JSON.
- [ ] Commit as `docs: add research notebook and guide`.
