# HazeSignal design

## Goal

Test whether fire hotspots in Sumatra and Kalimantan, weighted by winds carrying smoke toward Kuala Lumpur, are associated with higher Kuala Lumpur PM2.5 one or two days later during September 2019.

## Shape

HazeSignal is a TypeScript research repository, not an application. Small command-line scripts fetch each source into CSV files. A TypeScript Jupyter notebook imports readable analysis helpers, combines daily observations, calculates one- and two-day leads, fits a simple linear regression, and draws an SVG scatter plot.

The project uses Node.js 20's built-in `fetch`, `fs`, and test runner. Dependencies are limited to TypeScript execution, `.env` loading, CSV parsing/writing, and the TypeScript Jupyter kernel.

## Data sources

- NASA FIRMS `VIIRS_SNPP_NRT`: free MAP_KEY, requested separately for a Sumatra box (`95,-6,106,6`) and a Kalimantan box (`108,-4,119,7`). Raw rows retain a `region` column.
- Open-Meteo Archive API: no key. Hourly 10 m wind at Kuala Lumpur (`3.1390, 101.6869`) is aggregated to a daily vector mean.
- OpenAQ v3: free API key. The user supplies a Kuala Lumpur-area PM2.5 sensor ID because historical coverage and IDs can change. Daily measurements come from `/v3/sensors/{id}/days`.

Secrets live only in `.env`; `.env.example` documents `FIRMS_MAP_KEY`, `OPENAQ_API_KEY`, and `OPENAQ_SENSOR_ID`.

## Analysis

For each region, the notebook shows the source-to-Kuala-Lumpur initial bearing. Meteorological wind direction describes where wind comes from, so its travel bearing is `(direction + 180) % 360`. Alignment is the cosine of the angular difference between travel bearing and source-to-Kuala-Lumpur bearing, clipped at zero. The two region scores are averaged and multiplied by total hotspot count to make an aligned-hotspot predictor.

Daily PM2.5 values are shifted backward to create `pm25_next_day` and `pm25_in_two_days`. A one-predictor ordinary least-squares fit reports slope, intercept, Pearson r, and r-squared. The notebook treats the result as exploratory association, not evidence of causation or a production forecast.

## Errors and reproducibility

Fetchers fail with a clear message for missing keys, invalid dates, HTTP errors, or unexpected response shapes. Writes are atomic enough for this small project: a file is written only after the complete response parses. Committed sample CSVs let the notebook run without keys; each sample records its source and retrieval notes in `data/README.md`.

If authenticated FIRMS or OpenAQ history cannot be retrieved during repository creation, no readings will be invented. The repository will include openly retrievable samples where available and precise commands for the user to complete the protected pulls.

## Checks

One focused Node test file covers bearing, wind alignment, daily aggregation, lag joining, and regression. `npm test`, `npm run typecheck`, and a sample analysis run are the completion checks.

## Limits

The pilot uses one month, source-region centroids, 10 m wind at Kuala Lumpur, hotspot counts rather than fire radiative power, and one PM2.5 monitor. It omits transport time, vertical wind, humidity, rainfall, peat depth, fire persistence, and other pollution sources. Missing satellite overpasses and monitor gaps can bias results.
