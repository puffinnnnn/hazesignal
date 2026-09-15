# Data files

The fetch scripts save source responses here so an analysis can be repeated without calling the APIs again.

Do not edit measurements by hand or commit private API keys. This file will record the source, dates, and retrieval status of each committed sample.

| File | Source | Period | Retrieved |
| --- | --- | --- | --- |
| `firms_2019-09-01_2019-09-30.csv` | NASA FIRMS `VIIRS_SNPP_SP`; Sumatra `95,-6,106,6` and Kalimantan `108,-4,119,7` | 1–30 September 2019 | 14 September 2026 |
| `wind_2019-09-01_2019-09-30.csv` | Open-Meteo Historical Weather API, Kuala Lumpur (3.1390, 101.6869), Asia/Kuala_Lumpur time | 1–30 September 2019 | 13 September 2026 |
| `firms_2023-09-01_2023-09-30.csv` | NASA FIRMS `VIIRS_SNPP_SP`; same two regional boxes | 1–30 September 2023 | 14 September 2026 |
| `wind_2023-09-01_2023-09-30.csv` | Open-Meteo Historical Weather API, Kuala Lumpur (3.1390, 101.6869), Asia/Kuala_Lumpur time | 1–30 September 2023 | 14 September 2026 |
| `pm25_2023-09-01_2023-09-30.csv` | OpenAQ sensor 2085316, Kuala Lumpur, daily PM2.5 | 1–30 September 2023 | 14 September 2026 |
| `combined.csv` | Derived from the three September 2023 files above | 1–30 September 2023 | 14 September 2026 |
| `regression.svg` | Derived next-day wind-aligned hotspot regression | September 2023 | 14 September 2026 |
| `validation_2023.csv` | Daily table derived from NASA FIRMS, Open-Meteo and OpenAQ sensor 2085316 | 1 September–31 December 2023 | 15 September 2026 |

The FIRMS 2019 sample contains 171,521 hotspot rows: 58,370 from the Sumatra box and 113,151 from the Kalimantan box. The MAP_KEY is not stored in the CSV. The file covers 1–30 September in Malaysia time; the fetcher also queried the preceding UTC day so the first local day is complete.

The 2023 pilot contains 44,992 hotspots, 720 hourly wind readings, and 29 daily PM2.5 readings. OpenAQ has no reading for 27 September, and its 28 September daily value has 29% coverage. The API key is not stored in any CSV.

The four-month validation pull contained 98,577 hotspot rows, 2,928 hourly wind readings, and 117 daily PM2.5 readings. The large raw files remain local; `validation_2023.csv` contains the 122 daily rows required by `npm run validate`, including coverage fields used to exclude days below 75%. Recreate the source pulls by running the three fetch commands with `2023-09-01 2023-12-31`, then run the analysis with those matching files.

A 2019 OpenAQ sample is not included because its Kuala Lumpur station does not cover the historical study period. The included 2023 sample was pulled with the user's free API key without putting the key in the saved file.

OpenAQ's current Kuala Lumpur location begins reporting in November 2022, so it cannot supply the September 2019 validation series. For the study period, request daily PM2.5 observations for the Cheras station from Malaysia's Department of Environment data portal and save the approved export as `pm25_2019-09-01_2019-09-30.csv` with these columns:

```csv
date,pm25_ug_m3
2019-09-01,VALUE_FROM_SOURCE
```

`VALUE_FROM_SOURCE` is deliberately a placeholder here. Do not run the analysis until it has been replaced by a sourced measurement.
