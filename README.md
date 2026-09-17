# HazeSignal

HazeSignal is a small research project investigating whether satellite-detected fires in Sumatra and Kalimantan, combined with wind direction, can provide one or two days of warning before PM2.5 rises in Kuala Lumpur.

Most air-quality tools describe pollution after it reaches a ground monitor. This project tests an earlier signal: fires are active, and the wind is carrying air from those source regions toward Malaysia.

## Start here

If the project is already set up, one command gives the current Kuala Lumpur report:

```powershell
npm start
```

Read the first three labels in order:

1. **AIR TODAY** answers whether measured fine-particle pollution is good, moderate, unhealthy, very unhealthy or hazardous.
2. **NEXT 1–2 DAYS** says whether an unusually high fire-and-wind clue is present. It does not predict the exact future PM2.5 level.
3. **ACTION** gives a simple precaution and links to Malaysia's official APIMS reading.

To see whether the research model actually worked on later historical dates, run `npm run validate`. Lower prediction error is better. For the full scientific story, read [RESEARCH_REPORT.md](RESEARCH_REPORT.md). The notebook is optional; using the current check does not require Jupyter, Python or Deno.

To test the actual high-fire warning rule against an independent 2025 season, run `npm run backtest`. In that limited check it issued no warnings and missed both opportunities to warn before one unhealthy PM2.5 episode. It must not be treated as a reliable forecast.

For one real calculation in plain language, read [WORKED_EXAMPLE.md](WORKED_EXAMPLE.md). It shows the hotspot counts, wind adjustment, threshold and next-day PM2.5 for 19 September 2025.

## Hypothesis

> More fire hotspots, when winds are aligned from the fire regions toward Kuala Lumpur, are associated with higher ground-level PM2.5 one or two days later.

This is an exploratory association test. It is not a forecast service and cannot establish that a particular fire caused a particular pollution reading.

## The idea in simple words

HazeSignal has two separate jobs:

1. **Check the air now.** A ground monitor measures PM2.5, the tiny particles found in smoke and other air pollution.
2. **Look for an early clue.** A satellite finds unusually hot places that may be fires. If there are fires and the wind points from them toward Kuala Lumpur, smoke could follow later.

A hotspot is one satellite detection, not one whole fire and not a haze reading. The same large fire can produce several hotspot detections.

September 2023 is a past test used to see whether the early clue was useful. It is not the project's current reading.

## Check current conditions

After completing the setup below, run:

```powershell
npm start
```

The report answers three questions first:

- **TODAY:** Is fine-particle pollution good, moderate, unhealthy, very unhealthy, or hazardous at the selected monitor?
- **TOMORROW:** Is the fire-and-wind warning clue present? This is still labelled as a clue rather than a forecast.
- **WHAT YOU SHOULD DO:** What simple precaution fits the current particle category, plus a link to official APIMS advice.

The warning clue is intentionally conservative: the combined two-day fire-and-wind signal must reach the top 10% of the September–December 2023 pilot period. This is a provisional research threshold, not a forecast probability.

The command automatically finds up to five nearby PM2.5 sensors updated within the last 12 hours. If no monitor is recent enough, it shows “NOT ENOUGH DATA” instead of labelling older measurements as today's air. `OPENAQ_SENSOR_ID` is not needed for this current check. Each monitor needs at least 18 of the latest 24 hourly readings. HazeSignal uses the middle monitor value and shows the full monitor range, so one unusual sensor is less likely to control the result. The category uses the [Malaysia DOE PM2.5 concentration bands](https://eqms.doe.gov.my/Documents/APIMS/API_Calculation.pdf), but it is a PM2.5-only estimate rather than the official API, which checks several pollutants. For Malaysia's official current status and health advice, use [DOE APIMS](https://apims.doe.gov.my/).

### What the terms mean

- **PM2.5:** airborne solid particles and liquid droplets no wider than about 2.5 micrometres. These particles are small enough to travel deep into the lungs.
- **µg/m³:** micrograms of particles in one cubic metre of air. A microgram is one-millionth of a gram; a cubic metre is a cube measuring one metre on each side.
- **Hotspot:** one place where a satellite detected unusual heat. It is not necessarily a separate fire, and it is not a direct measurement of haze.
- **Fire radiative power (FRP):** the satellite's estimate of how quickly a detected fire is releasing radiant heat, measured in megawatts. HazeSignal tests it as a simple clue for fire intensity.
- **Wind match:** how closely the current wind points from a fire region toward Kuala Lumpur. `100%` is directly aligned; `0%` is sideways or away.

Peat and plant material can undergo incomplete combustion, producing soot, ash, and condensed organic compounds. These fine solid particles and liquid aerosols can remain suspended in the atmosphere. Wind then transports the particle-containing air mass. This materials-science link explains why the project measures fires first, transport second, and PM2.5 at the destination last.

## Historical result

The complete reproducible example uses September 2023, when all three sources overlap. After excluding a target day with only 29% PM2.5 coverage, hotspot count alone has `r = 0.552`, while wind-aligned hotspot count has `r = 0.696` across 27 next-day observations. These are in-sample correlations from one month, not validated forecast accuracy.

You can ignore `r` and `R²` when using the current check. They only describe the past experiment. Here, `r` is a pattern score: a value near `1` means the fire-and-wind number and next-day PM2.5 often rose together; a value near `0` means no clear straight-line pattern. An `r` of `0.696` does **not** mean the project is 69.6% accurate. `R²` is another way researchers summarize the same fitted line, and it also does not measure forecast accuracy.

A stronger follow-up trains the models on September–October 2023 and tests them on 54 unseen, sufficiently complete target days in November–December. Average next-day errors were:

| Method | Average error |
| --- | ---: |
| Assume tomorrow resembles today | 2.85 µg/m³ |
| Fire hotspots only | 2.80 µg/m³ |
| Fire hotspots plus wind alignment | 5.91 µg/m³ |
| Fire intensity only | 3.12 µg/m³ |
| Fire intensity plus wind alignment | 6.15 µg/m³ |

Hotspot count alone had just 0.06 µg/m³ less average error than the baseline, effectively a tie in this short test. Weighting detections by NASA fire radiative power did not improve the result, and adding wind performed much worse. The central fire-plus-wind hypothesis is therefore not yet supported as a reliable early-warning predictor. This mixed result is kept visible rather than selecting only the month where wind alignment looked helpful.

An independent September–October 2025 test found 56 eligible end-of-day warning decisions at a Taman Tun Dr. Ismail monitor. One unhealthy episode gave two chances to warn; the fixed 2023 threshold triggered on neither date. Another monitor at Setia Eco Park rose at the same time but did not cross the unhealthy band. These observations do not establish whether the fires caused the rise. See [RESEARCH_REPORT.md](RESEARCH_REPORT.md) for the calculation and limits.

## What is included

```text
hazesignal/
├── README.md
├── RESEARCH_REPORT.md
├── WORKED_EXAMPLE.md
├── notebooks/01_analysis.ipynb
├── src/
│   ├── analysis.ts
│   ├── backtest_warning.ts
│   ├── current.ts
│   ├── csv.ts
│   ├── fetch_firms.ts
│   ├── fetch_pm25.ts
│   ├── fetch_wind.ts
│   ├── run_analysis.ts
│   └── validate_model.ts
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
date,pm25_ug_m3,coverage_percent
2019-09-01,VALUE_FROM_SOURCE,VALUE_FROM_SOURCE
```

The fields above only demonstrate the file shape. Replace them with the actual sourced measurement and percentage of the day covered. Exclude a date if its coverage cannot be verified. The repository intentionally does not invent a daily PM2.5 sample.

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

The FIRMS script uses the `VIIRS_SNPP_SP` standard-processing archive because the study period is historical. It makes separate requests for the supplied Sumatra box (`95,-6,106,6`) and a Kalimantan box (`108,-4,119,7`). It downloads one day at a time in small batches so large archive responses do not time out. FIRMS acquisition timestamps are UTC; the analysis converts them to Malaysia time (UTC+8) before grouping detections by calendar day.

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

The notebook contains the full reasoning. Run all of its TypeScript code from the terminal with:

```powershell
npm run notebook
```

This repeats the same calculations and refreshes `data/regression.svg`. Use `npm run analyze` when you also want to rewrite `data/combined.csv`. You can read `notebooks/01_analysis.ipynb` in VS Code without selecting a kernel or pressing **Run All**. Python and a system-wide Deno installation are not required.

## Test the model on later dates

The repository includes a compact four-month daily table. Run:

```powershell
npm run validate
```

This fits the two fire models on September–October 2023, evaluates them on November–December, and compares their average error with the simple assumption that tomorrow's PM2.5 will resemble today's. Lower error is better. The testing dates are kept out of model fitting so this is a more demanding check than measuring correlation on the same dates used to draw the line.

The separate `npm run backtest` command checks the live rule's fixed 2023 threshold against a 2025 fire season. It counts days when an unhealthy PM2.5 reading lay one or two days ahead, along with warnings, misses and false alarms. Zero warnings means a false-alarm percentage cannot be estimated; it does not mean the warning rule succeeded.

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

- Four months from one Kuala Lumpur sensor are still too little to establish a reliable warning model.
- Days with unknown or below-75% PM2.5 coverage are excluded from regression and validation. Four daily values in the four-month sample fall below that threshold.
- The original September correlations are fitted and measured on the same observations. In the later held-out test, the wind-aligned model did not beat the persistence baseline.
- A regional centre and Kuala Lumpur's local 10 m wind simplify a long, changing transport path.
- The rectangular fire boxes can include nearby territories and islands; exact administrative polygons would isolate Indonesian Sumatra and Kalimantan more precisely.
- Fire radiative power is a heat-release clue, not a direct smoke-emission measurement. Weighting hotspots by it did not improve this short validation.
- Clouds, missed satellite passes, and monitor gaps can remove observations.
- Rainfall, humidity, boundary-layer height, vertical wind, fire duration, peat depth, and local emissions are omitted.
- Kalimantan smoke more directly affects East Malaysia; combining it with a Kuala Lumpur outcome may weaken the relationship.
- Linear regression assumes a straight-line relationship and does not prove causation.
- The pilot uses complete daily wind averages and next-day PM2.5 levels. An operational warning test would use only information available at prediction time and compare against a current-PM2.5 persistence baseline.

A fuller study should cover several haze and non-haze seasons, compare multiple Malaysian stations, add rainfall and humidity, sample wind along the transport route, and keep evaluating predictions on dates not used to fit the model.

## Checks

```bash
npm run check
```

The focused tests cover CSV parsing, calendar validation, compass bearings, circular wind averaging, lagged joins, and regression arithmetic.
