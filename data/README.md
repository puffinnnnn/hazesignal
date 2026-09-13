# Data files

The fetch scripts save source responses here so an analysis can be repeated without calling the APIs again.

Do not edit measurements by hand or commit private API keys. This file will record the source, dates, and retrieval status of each committed sample.

| File | Source | Period | Retrieved |
| --- | --- | --- | --- |
| `firms_2019-09-01_2019-09-30.csv` | NASA FIRMS `VIIRS_SNPP_SP`; Sumatra `95,-6,106,6` and Kalimantan `108,-4,119,7` | 1–30 September 2019 | 14 September 2026 |
| `wind_2019-09-01_2019-09-30.csv` | Open-Meteo Historical Weather API, Kuala Lumpur (3.1390, 101.6869), Asia/Kuala_Lumpur time | 1–30 September 2019 | 13 September 2026 |

The FIRMS sample contains 170,930 hotspot rows: 58,257 from the Sumatra box and 112,673 from the Kalimantan box. The MAP_KEY is not stored in the CSV.

An OpenAQ sample is not included because its Kuala Lumpur station does not cover the 2019 study period. The fetch script can pull later periods using the user's free API key without putting the key in the saved file.

OpenAQ's current Kuala Lumpur location begins reporting in November 2022, so it cannot supply the September 2019 validation series. For the study period, request daily PM2.5 observations for the Cheras station from Malaysia's Department of Environment data portal and save the approved export as `pm25_2019-09-01_2019-09-30.csv` with these columns:

```csv
date,pm25_ug_m3
2019-09-01,VALUE_FROM_SOURCE
```

`VALUE_FROM_SOURCE` is deliberately a placeholder here. Do not run the analysis until it has been replaced by a sourced measurement.
