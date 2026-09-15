import { access, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import {
  combineDailyData,
  dailyWind,
  isUsablePm25,
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
  coverage_percent?: string;
}

async function requireFile(path: string, command: string): Promise<void> {
  try {
    await access(path);
  } catch {
    throw new Error(`Missing ${path}. Create it with: ${command}`);
  }
}

async function main(): Promise<void> {
  const firmsPath = resolve(process.argv[2] ?? "data/firms_2023-09-01_2023-09-30.csv");
  const windPath = resolve(process.argv[3] ?? "data/wind_2023-09-01_2023-09-30.csv");
  const pm25Path = resolve(process.argv[4] ?? "data/pm25_2023-09-01_2023-09-30.csv");
  await requireFile(firmsPath, "npm run fetch:firms -- 2023-09-01 2023-09-30");
  await requireFile(windPath, "npm run fetch:wind -- 2023-09-01 2023-09-30");
  await requireFile(pm25Path, "npm run fetch:pm25 -- 2023-09-01 2023-09-30");

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
    coverage_percent: row.coverage_percent ? Number(row.coverage_percent) : undefined,
  }));
  const combined = combineDailyData(hotspots, dailyWind(wind), pm25);
  const nextDayRows = combined.filter((row) =>
    isUsablePm25(row.pm25_next_day, row.pm25_next_day_coverage_percent)
  );
  const twoDayRows = combined.filter((row) =>
    isUsablePm25(row.pm25_in_two_days, row.pm25_in_two_days_coverage_percent)
  );
  const points = nextDayRows.map((row) => ({
    x: row.aligned_hotspot_count,
    y: row.pm25_next_day!,
  }));
  const regression = linearRegression(points);
  const rawNextDay = linearRegression(nextDayRows.map((row) => ({
    x: row.hotspot_count,
    y: row.pm25_next_day!,
  })));
  const alignedTwoDay = linearRegression(twoDayRows.map((row) => ({
    x: row.aligned_hotspot_count,
    y: row.pm25_in_two_days!,
  })));
  const rawTwoDay = linearRegression(twoDayRows.map((row) => ({
    x: row.hotspot_count,
    y: row.pm25_in_two_days!,
  })));

  await writeCsv(resolve("data/combined.csv"), combined as unknown as CsvRow[]);
  await writeFile(resolve("data/regression.svg"), scatterSvg(points, regression), "utf8");
  console.table([
    { predictor: "hotspot count", lead: "1 day", r: rawNextDay.r, rSquared: rawNextDay.rSquared, observations: rawNextDay.observations },
    { predictor: "wind-aligned hotspots", lead: "1 day", r: regression.r, rSquared: regression.rSquared, observations: regression.observations },
    { predictor: "hotspot count", lead: "2 days", r: rawTwoDay.r, rSquared: rawTwoDay.rSquared, observations: rawTwoDay.observations },
    { predictor: "wind-aligned hotspots", lead: "2 days", r: alignedTwoDay.r, rSquared: alignedTwoDay.rSquared, observations: alignedTwoDay.observations },
  ]);
  console.log("Saved data/combined.csv and data/regression.svg");
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
