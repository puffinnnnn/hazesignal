import "dotenv/config";

import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { addDays, parseCsv, validateDateRange, writeCsv, type CsvRow } from "./csv.js";

const FIRMS_URL = "https://firms.modaps.eosdis.nasa.gov/api/area/csv";
const SENSOR = "VIIRS_SNPP_SP";
const REGIONS = [
  { name: "sumatra", bbox: "95,-6,106,6" },
  { name: "kalimantan", bbox: "108,-4,119,7" },
] as const;

type FirmsApiRow = Record<string, string> & {
  latitude: string;
  longitude: string;
  acq_date: string;
};

async function fetchChunk(
  region: typeof REGIONS[number],
  startDate: string,
  dayRange: number,
  mapKey: string,
): Promise<CsvRow[]> {
  const url = `${FIRMS_URL}/${mapKey}/${SENSOR}/${region.bbox}/${dayRange}/${startDate}`;
  const response = await fetch(url, { signal: AbortSignal.timeout(60_000) });
  if (!response.ok) throw new Error(`FIRMS request failed (${response.status}) for ${region.name}.`);

  const text = await response.text();
  if (!text.split(/\r?\n/, 1)[0]?.includes("latitude")) {
    throw new Error(`FIRMS returned an unexpected response for ${region.name}. Check the MAP_KEY and date range.`);
  }
  return parseCsv<FirmsApiRow>(text).map((row) => ({ ...row, region: region.name }));
}

export async function fetchFirms(
  startDate: string,
  endDate: string,
  mapKey = process.env.FIRMS_MAP_KEY,
): Promise<CsvRow[]> {
  validateDateRange(startDate, endDate);
  if (!mapKey) throw new Error("FIRMS_MAP_KEY is missing. Copy .env.example to .env and add your free key.");

  const requests: Array<{ region: typeof REGIONS[number]; startDate: string }> = [];
  for (const region of REGIONS) {
    let chunkStart = startDate;
    while (chunkStart <= endDate) {
      requests.push({ region, startDate: chunkStart });
      chunkStart = addDays(chunkStart, 1);
    }
  }

  const rows: CsvRow[] = [];
  for (let index = 0; index < requests.length; index += 6) {
    const batch = requests.slice(index, index + 6);
    rows.push(...(await Promise.all(
      batch.map((request) => fetchChunk(request.region, request.startDate, 1, mapKey)),
    )).flat());
  }
  return rows;
}

async function main(): Promise<void> {
  const start = process.argv[2] ?? "2019-09-01";
  const end = process.argv[3] ?? "2019-09-30";
  const rows = await fetchFirms(start, end);
  const output = resolve(`data/firms_${start}_${end}.csv`);
  await writeCsv(output, rows);
  console.log(`Saved ${rows.length} hotspots to ${output}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
