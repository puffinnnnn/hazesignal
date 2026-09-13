import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { validateDateRange, writeCsv, type CsvRow } from "./csv.js";

const ARCHIVE_URL = "https://archive-api.open-meteo.com/v1/archive";
const KUALA_LUMPUR = { latitude: 3.139, longitude: 101.6869 };

interface WindResponse {
  hourly?: {
    time?: string[];
    wind_speed_10m?: Array<number | null>;
    wind_direction_10m?: Array<number | null>;
  };
}

export async function fetchWind(startDate: string, endDate: string): Promise<CsvRow[]> {
  validateDateRange(startDate, endDate);
  const params = new URLSearchParams({
    latitude: String(KUALA_LUMPUR.latitude),
    longitude: String(KUALA_LUMPUR.longitude),
    start_date: startDate,
    end_date: endDate,
    hourly: "wind_speed_10m,wind_direction_10m",
    timezone: "Asia/Kuala_Lumpur",
  });
  const response = await fetch(`${ARCHIVE_URL}?${params}`);
  if (!response.ok) throw new Error(`Open-Meteo request failed (${response.status}).`);

  const data = await response.json() as WindResponse;
  const { time, wind_speed_10m: speed, wind_direction_10m: direction } = data.hourly ?? {};
  if (!time || !speed || !direction || time.length !== speed.length || time.length !== direction.length) {
    throw new Error("Open-Meteo returned incomplete hourly wind data.");
  }

  return time.flatMap((timestamp, index) => {
    const windSpeed = speed[index];
    const windDirection = direction[index];
    return windSpeed == null || windDirection == null ? [] : [{
      date: timestamp.slice(0, 10),
      time: timestamp,
      wind_speed_kmh: windSpeed,
      wind_direction_degrees: windDirection,
    }];
  });
}

async function main(): Promise<void> {
  const start = process.argv[2] ?? "2019-09-01";
  const end = process.argv[3] ?? "2019-09-30";
  const rows = await fetchWind(start, end);
  const output = resolve(`data/wind_${start}_${end}.csv`);
  await writeCsv(output, rows);
  console.log(`Saved ${rows.length} hourly wind readings to ${output}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}

