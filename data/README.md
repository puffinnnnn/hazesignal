# Data files

The fetch scripts save source responses here so an analysis can be repeated without calling the APIs again.

Do not edit measurements by hand or commit private API keys. This file will record the source, dates, and retrieval status of each committed sample.

| File | Source | Period | Retrieved |
| --- | --- | --- | --- |
| `wind_2019-09-01_2019-09-30.csv` | Open-Meteo Historical Weather API, Kuala Lumpur (3.1390, 101.6869), Asia/Kuala_Lumpur time | 1–30 September 2019 | 13 September 2026 |

FIRMS and OpenAQ samples are not included because both services require the user's free API key. Run the commands in the main README after adding the keys; the scripts save responses here without putting a key in the files.

OpenAQ's current Kuala Lumpur location begins reporting in November 2022, so it cannot supply the September 2019 validation series. For the study period, request daily PM2.5 observations for the Cheras station from Malaysia's Department of Environment data portal and save the approved export as `pm25_2019-09-01_2019-09-30.csv` with these columns:

```csv
date,pm25_ug_m3
2019-09-01,VALUE_FROM_SOURCE
```

`VALUE_FROM_SOURCE` is deliberately a placeholder here. Do not run the analysis until it has been replaced by a sourced measurement.
