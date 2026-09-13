import "dotenv/config";

import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { validateDateRange, writeCsv, type CsvRow } from "./csv.js";

const OPENAQ_URL = "https://api.openaq.org/v3";

interface OpenAqDay {
  value: number | null;
  parameter: { name: string; units: string };
  period: { datetimeFrom: { local: string; utc: string } } | null;
  coverage?: { percentComplete?: number } | null;
}

interface OpenAqResponse {
  results?: OpenAqDay[];
}

export async function fetchPm25(
  startDate: string,
  endDate: string,
  apiKey = process.env.OPENAQ_API_KEY,
  sensorId = process.env.OPENAQ_SENSOR_ID,
): Promise<CsvRow[]> {
  validateDateRange(startDate, endDate);
  if (!apiKey) throw new Error("OPENAQ_API_KEY is missing. Copy .env.example to .env and add your free key.");
  if (!sensorId || !/^\d+$/.test(sensorId)) throw new Error("OPENAQ_SENSOR_ID must be a numeric PM2.5 sensor ID.");

  const params = new URLSearchParams({ date_from: startDate, date_to: endDate, limit: "1000" });
  const response = await fetch(`${OPENAQ_URL}/sensors/${sensorId}/days?${params}`, {
    headers: { "X-API-Key": apiKey },
  });
  if (!response.ok) throw new Error(`OpenAQ request failed (${response.status}). Check the key and sensor ID.`);

  const data = await response.json() as OpenAqResponse;
  if (!Array.isArray(data.results)) throw new Error("OpenAQ returned an unexpected response.");
  const wrongParameter = data.results.find((row) => row.parameter.name.toLowerCase() !== "pm25");
  if (wrongParameter) throw new Error(`Sensor ${sensorId} reports ${wrongParameter.parameter.name}, not PM2.5.`);

  const rows = data.results.flatMap((row) => row.value == null || !row.period ? [] : [{
    date: row.period.datetimeFrom.local.slice(0, 10),
    pm25_ug_m3: row.value,
    unit: row.parameter.units,
    coverage_percent: row.coverage?.percentComplete ?? "",
    sensor_id: sensorId,
  }]);
  if (rows.length === 0) throw new Error(`OpenAQ has no PM2.5 data for sensor ${sensorId} in this date range.`);
  return rows;
}

async function main(): Promise<void> {
  const start = process.argv[2] ?? "2019-09-01";
  const end = process.argv[3] ?? "2019-09-30";
  const rows = await fetchPm25(start, end);
  const output = resolve(`data/pm25_${start}_${end}.csv`);
  await writeCsv(output, rows);
  console.log(`Saved ${rows.length} daily PM2.5 readings to ${output}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
