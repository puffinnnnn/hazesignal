import "dotenv/config";

import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { addDays, daysInclusive, parseCsv, validateDateRange, writeCsv, type CsvRow } from "./csv.js";

const FIRMS_URL = "https://firms.modaps.eosdis.nasa.gov/api/area/csv";
const SENSOR = "VIIRS_SNPP_NRT";
const REGIONS = [
  { name: "sumatra", bbox: "95,-6,106,6" },
  { name: "kalimantan", bbox: "108,-4,119,7" },
] as const;

type FirmsApiRow = Record<string, string> & {
  latitude: string;
  longitude: string;
  acq_date: string;
};

export async function fetchFirms(
  startDate: string,
  endDate: string,
  mapKey = process.env.FIRMS_MAP_KEY,
): Promise<CsvRow[]> {
  validateDateRange(startDate, endDate);
  if (!mapKey) throw new Error("FIRMS_MAP_KEY is missing. Copy .env.example to .env and add your free key.");

  const rows: CsvRow[] = [];
  for (const region of REGIONS) {
    let chunkStart = startDate;
    while (chunkStart <= endDate) {
      const dayRange = Math.min(10, daysInclusive(chunkStart, endDate));
      const url = `${FIRMS_URL}/${mapKey}/${SENSOR}/${region.bbox}/${dayRange}/${chunkStart}`;
      const response = await fetch(url);
      if (!response.ok) throw new Error(`FIRMS request failed (${response.status}) for ${region.name}.`);

      const chunk = parseCsv<FirmsApiRow>(await response.text());
      if (chunk.length > 0 && (!chunk[0]?.latitude || !chunk[0]?.longitude || !chunk[0]?.acq_date)) {
        throw new Error(`FIRMS returned an unexpected response for ${region.name}.`);
      }
      rows.push(...chunk.map((row) => ({ ...row, region: region.name })));
      chunkStart = addDays(chunkStart, dayRange);
    }
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

