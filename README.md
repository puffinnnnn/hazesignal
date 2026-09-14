# HazeSignal

HazeSignal is a small research project investigating whether satellite-detected fires in Sumatra and Kalimantan, combined with wind direction, can provide one or two days of warning before PM2.5 rises in Kuala Lumpur.

Most air-quality tools describe pollution after it reaches a ground monitor. This project tests an earlier signal: fires are active, and the wind is carrying air from those source regions toward Malaysia.

## Hypothesis

> More fire hotspots, when winds are aligned from the fire regions toward Kuala Lumpur, are associated with higher ground-level PM2.5 one or two days later.

This is an exploratory association test. It is not a forecast service and cannot establish that a particular fire caused a particular pollution reading.

## Current pilot result

The complete reproducible example uses September 2023, when all three sources overlap. Across 28 next-day observations, hotspot count alone has `r = 0.637`, while wind-aligned hotspot count has `r = 0.758`. Excluding the target day with only 29% PM2.5 coverage reduces the aligned result to `r = 0.693` across 27 observations. These are in-sample correlations from one month, not validated forecast accuracy.

## What is included

```text
hazesignal/
├── README.md
├── notebooks/01_analysis.ipynb
├── src/
│   ├── analysis.ts
│   ├── csv.ts
│   ├── fetch_firms.ts
│   ├── fetch_pm25.ts
│   ├── fetch_wind.ts
│   └── run_analysis.ts
├── test/hazesignal.test.ts
├── data/
├── .env.example
├── package.json
└── tsconfig.json
```

The code uses TypeScript throughout. The fetchers save CSV files, the command-line analysis produces a combined table and SVG plot, and the notebook explains each decision and calculation.

## Data and cost

All sources used here are free.

| Source | Purpose | Key needed? |
| --- | --- | --- |
| [NASA FIRMS](https://firms.modaps.eosdis.nasa.gov/api/) | Archived VIIRS Suomi-NPP fire hotspots | Free MAP_KEY |
| [Open-Meteo Archive API](https://open-meteo.com/en/docs/historical-weather-api) | Hourly Kuala Lumpur wind | No |
| [OpenAQ](https://docs.openaq.org/) | Daily PM2.5 for periods with monitor coverage | Free API key |
| [Malaysia DOE data request portal](https://btm.doe.gov.my/permohonandata/udara) | September 2019 Cheras PM2.5 | Request through the public/student route |

OpenAQ requires registration but does not charge for an API key. NASA FIRMS MAP_KEY registration is also free. No paid API is required.

## Historical PM2.5 caveat

The current OpenAQ Kuala Lumpur record starts on 3 November 2022, so an OpenAQ key does not unlock the September 2019 readings. Malaysia's official open-data catalogue publishes PM2.5 only as monthly averages, which is too coarse for a one-day lead test. The former public APIMS hourly URL also no longer serves the 2019 files.

For the intended 2019 experiment, request daily Cheras PM2.5 data from the DOE portal linked above. Save the approved data as `data/pm25_2019-09-01_2019-09-30.csv`:

```csv
date,pm25_ug_m3
2019-09-01,VALUE_FROM_SOURCE
```

The second field above only demonstrates the file shape. Replace it with the actual sourced value and do not label illustrative values as observations. The repository intentionally does not invent a daily PM2.5 sample.

For a later study period covered by OpenAQ, use `src/fetch_pm25.ts` with a PM2.5 sensor ID from [OpenAQ Explorer](https://explore.openaq.org/).

## Setup

Install [Node.js 20 or newer](https://nodejs.org/), then run:

```bash
npm install
cp .env.example .env
```

On Windows PowerShell, use `Copy-Item .env.example .env` instead of `cp`.

Add these values to `.env`:

```dotenv
FIRMS_MAP_KEY=your_free_firms_key
OPENAQ_API_KEY=your_free_openaq_key
OPENAQ_SENSOR_ID=numeric_pm25_sensor_id
```

Only `FIRMS_MAP_KEY` is needed for a fire pull. The OpenAQ values are optional if you use a DOE PM2.5 export. `.env` is ignored by Git.

## Fetch the study data

```bash
npm run fetch:firms -- 2023-09-01 2023-09-30
npm run fetch:wind -- 2023-09-01 2023-09-30
npm run fetch:pm25 -- 2023-09-01 2023-09-30
```

The FIRMS script uses the `VIIRS_SNPP_SP` standard-processing archive because the study period is historical. It makes separate requests for the supplied Sumatra box (`95,-6,106,6`) and a Kalimantan box (`108,-4,119,7`). It downloads one day at a time in small batches so large archive responses do not time out.

The matching September 2023 samples are included, so these downloads are only needed when refreshing the data. To collect the intended September 2019 fire and wind inputs while the DOE PM2.5 request is pending:

```bash
npm run fetch:firms -- 2019-09-01 2019-09-30
npm run fetch:wind -- 2019-09-01 2019-09-30
```

Each command prints the exact CSV path it creates. HTTP failures and missing keys stop with a direct explanation; the project does not route requests through a third-party proxy.

## Run the analysis

The included September 2023 files are the default inputs:

```bash
npm run analyze
```

You can pass three other matching CSV paths after `--` to analyse a different period.

This writes:

- `data/combined.csv`: daily hotspot count, mean wind, alignment, and later PM2.5.
- `data/regression.svg`: scatter plot and regression line.

The notebook contains the full reasoning. Deno is installed locally by `npm install`, and the existing VS Code installation can provide the notebook interface. Register the local Deno kernel and install VS Code's official Jupyter extension once:

```powershell
npm run notebook:install
code --install-extension ms-toolsai.jupyter
code notebooks\01_analysis.ipynb
```

Select the **Deno** kernel in the top-right corner if VS Code asks. Python is not required; all notebook cells remain TypeScript.

## Wind alignment in plain language

Weather reports describe the direction wind comes **from**. Smoke travels in the opposite direction:

```text
travel bearing = (wind-from direction + 180°) mod 360°
```

The code calculates the compass bearing from each fire-region centre to Kuala Lumpur. It then takes the cosine of the angle between that route and the wind's travel direction:

```text
alignment = max(0, cos(travel bearing - route bearing))
```

An alignment of `1` means the wind points directly toward Kuala Lumpur. `0` means it is perpendicular or blowing away. Multiplying this score by hotspot count gives the simple predictor used in the regression.

## Limitations

- One month is too small to establish a reliable warning model.
- The September 2023 OpenAQ series is missing 27 September, and 28 September has only 29% daily coverage.
- The reported correlations are fitted and measured on the same 28 observations, so they do not show performance on unseen dates.
- A regional centre and Kuala Lumpur's local 10 m wind simplify a long, changing transport path.
- Hotspot count treats a small fire and an intense peat fire equally. Fire radiative power would add useful information.
- Clouds, missed satellite passes, and monitor gaps can remove observations.
- Rainfall, humidity, boundary-layer height, vertical wind, fire duration, peat depth, and local emissions are omitted.
- Kalimantan smoke more directly affects East Malaysia; combining it with a Kuala Lumpur outcome may weaken the relationship.
- Linear regression assumes a straight-line relationship and does not prove causation.

A fuller study should cover several haze and non-haze seasons, compare multiple Malaysian stations, add rainfall and humidity, test fire radiative power, and evaluate predictions on dates not used to fit the model.

## Checks

```bash
npm test
npm run typecheck
```

The focused tests cover CSV parsing, calendar validation, compass bearings, circular wind averaging, lagged joins, and regression arithmetic.
