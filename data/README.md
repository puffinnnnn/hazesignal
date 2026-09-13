# Data files

The fetch scripts save source responses here so an analysis can be repeated without calling the APIs again.

Do not edit measurements by hand or commit private API keys. This file will record the source, dates, and retrieval status of each committed sample.

| File | Source | Period | Retrieved |
| --- | --- | --- | --- |
| `wind_2019-09-01_2019-09-30.csv` | Open-Meteo Historical Weather API, Kuala Lumpur (3.1390, 101.6869), Asia/Kuala_Lumpur time | 1–30 September 2019 | 13 September 2026 |

FIRMS and OpenAQ samples are not included yet because both services require the user's free API key. Run the commands in the main README after adding the keys; the scripts save the responses here without putting a key in the files.
