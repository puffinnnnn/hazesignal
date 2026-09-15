import "dotenv/config";

import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { addDays, parseCsv, validateDateRange, writeCsv, type CsvRow } from "./csv.js";
import { malaysiaFireDate } from "./analysis.js";

export const FIRMS_URL = "https://firms.modaps.eosdis.nasa.gov/api/area/csv";
const SENSOR = "VIIRS_SNPP_SP";
export const FIRE_REGIONS = [
  { name: "sumatra", bbox: "95,-6,106,6" },
  { name: "kalimantan", bbox: "108,-4,119,7" },
] as const;

type FirmsApiRow = Record<string, string> & {
  latitude: string;
  longitude: string;
  acq_date: string;
  frp: string;
};
type FirmsRow = FirmsApiRow & { region: typeof FIRE_REGIONS[number]["name"] };

export async function fetchWithRetry(
  url: string,
  request: typeof fetch = fetch,
  delayMs = 1_000,
): Promise<Response> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await request(url, { signal: AbortSignal.timeout(60_000) });
      if (response.status !== 408 && response.status !== 429 && response.status < 500) return response;
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, delayMs * attempt));
  }
  throw new Error(`FIRMS request failed after 3 attempts: ${lastError instanceof Error ? lastError.message : lastError}`);
}

async function fetchChunk(
  region: typeof FIRE_REGIONS[number],
  startDate: string,
  dayRange: number,
  mapKey: string,
  request: typeof fetch,
): Promise<FirmsRow[]> {
  const url = `${FIRMS_URL}/${mapKey}/${SENSOR}/${region.bbox}/${dayRange}/${startDate}`;
  let response: Response;
  try {
    response = await fetchWithRetry(url, request);
  } catch (error) {
    throw new Error(`FIRMS request failed for ${region.name} on ${startDate}: ${error instanceof Error ? error.message : error}`);
  }
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
  request: typeof fetch = fetch,
): Promise<CsvRow[]> {
  validateDateRange(startDate, endDate);
  if (!mapKey) throw new Error("FIRMS_MAP_KEY is missing. Copy .env.example to .env and add your free key.");

  const requests: Array<{ region: typeof FIRE_REGIONS[number]; startDate: string }> = [];
  for (const region of FIRE_REGIONS) {
    let chunkStart = addDays(startDate, -1);
    while (chunkStart <= endDate) {
      requests.push({ region, startDate: chunkStart });
      chunkStart = addDays(chunkStart, 1);
    }
  }

  const rows: FirmsRow[] = [];
  for (let index = 0; index < requests.length; index += 6) {
    const batch = requests.slice(index, index + 6);
    rows.push(...(await Promise.all(
      batch.map((chunk) => fetchChunk(chunk.region, chunk.startDate, 1, mapKey, request)),
    )).flat());
  }
  return rows.flatMap((row) => {
    const localDate = malaysiaFireDate(row);
    return localDate < startDate || localDate > endDate ? [] : [{ ...row, local_date: localDate }];
  });
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
