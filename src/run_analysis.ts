import { access, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import {
  combineDailyData,
  dailyWind,
  linearRegression,
  scatterSvg,
  type FireHotspot,
  type HourlyWind,
  type Pm25Reading,
} from "./analysis.js";
import { readCsv, writeCsv, type CsvRow } from "./csv.js";

interface RawWind {
  date: string;
  wind_speed_kmh: string;
  wind_direction_degrees: string;
}

interface RawPm25 {
  date: string;
  pm25_ug_m3: string;
}

async function requireFile(path: string, command: string): Promise<void> {
  try {
    await access(path);
  } catch {
    throw new Error(`Missing ${path}. Create it with: ${command}`);
  }
}

async function main(): Promise<void> {
  const firmsPath = resolve(process.argv[2] ?? "data/firms_2019-09-01_2019-09-30.csv");
  const windPath = resolve(process.argv[3] ?? "data/wind_2019-09-01_2019-09-30.csv");
  const pm25Path = resolve(process.argv[4] ?? "data/pm25_2019-09-01_2019-09-30.csv");
  await requireFile(firmsPath, "npm run fetch:firms -- 2019-09-01 2019-09-30");
  await requireFile(windPath, "npm run fetch:wind -- 2019-09-01 2019-09-30");
  await requireFile(pm25Path, "npm run fetch:pm25 -- 2019-09-01 2019-09-30");

  const hotspots = await readCsv<FireHotspot>(firmsPath);
  const rawWind = await readCsv<RawWind>(windPath);
  const rawPm25 = await readCsv<RawPm25>(pm25Path);
  const wind: HourlyWind[] = rawWind.map((row) => ({
    date: row.date,
    wind_speed_kmh: Number(row.wind_speed_kmh),
    wind_direction_degrees: Number(row.wind_direction_degrees),
  }));
  const pm25: Pm25Reading[] = rawPm25.map((row) => ({
    date: row.date,
    pm25_ug_m3: Number(row.pm25_ug_m3),
  }));
  const combined = combineDailyData(hotspots, dailyWind(wind), pm25);
  const points = combined.flatMap((row) => row.pm25_next_day == null ? [] : [{
    x: row.aligned_hotspot_count,
    y: row.pm25_next_day,
  }]);
  const regression = linearRegression(points);

  await writeCsv(resolve("data/combined.csv"), combined as unknown as CsvRow[]);
  await writeFile(resolve("data/regression.svg"), scatterSvg(points, regression), "utf8");
  console.table(regression);
  console.log("Saved data/combined.csv and data/regression.svg");
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
