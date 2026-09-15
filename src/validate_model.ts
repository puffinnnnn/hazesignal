import { pathToFileURL } from "node:url";

import { isUsablePm25, linearRegression, meanAbsoluteError } from "./analysis.js";
import { addDays, readCsv } from "./csv.js";

interface CombinedCsvRow extends Record<string, string> {
  date: string;
  hotspot_count: string;
  aligned_hotspot_count: string;
  fire_radiative_power_mw: string;
  aligned_fire_radiative_power_mw: string;
  pm25_ug_m3: string;
  pm25_coverage_percent: string;
  pm25_next_day: string;
  pm25_next_day_coverage_percent: string;
}

interface ValidationDay {
  date: string;
  hotspots: number;
  alignedHotspots: number;
  firePower: number;
  alignedFirePower: number;
  pm25Today: number;
  pm25Tomorrow: number;
}

const numberOrNull = (value: string): number | null => {
  if (value.trim() === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

async function main(): Promise<void> {
  const input = process.argv[2] ?? "data/validation_2023.csv";
  const cutoff = process.argv[3] ?? "2023-11-01";
  const rows = await readCsv<CombinedCsvRow>(input);
  const days = rows.flatMap((row): ValidationDay[] => {
    const todayCoverage = numberOrNull(row.pm25_coverage_percent ?? "");
    const tomorrowCoverage = numberOrNull(row.pm25_next_day_coverage_percent ?? "");
    const values = [
      numberOrNull(row.hotspot_count),
      numberOrNull(row.aligned_hotspot_count),
      numberOrNull(row.fire_radiative_power_mw),
      numberOrNull(row.aligned_fire_radiative_power_mw),
      numberOrNull(row.pm25_ug_m3),
      numberOrNull(row.pm25_next_day),
    ];
    if (values.some((value) => value == null)) return [];
    if (todayCoverage == null || tomorrowCoverage == null) return [];
    if (!isUsablePm25(values[4]!, todayCoverage) || !isUsablePm25(values[5]!, tomorrowCoverage)) return [];
    return [{
      date: row.date,
      hotspots: values[0]!,
      alignedHotspots: values[1]!,
      firePower: values[2]!,
      alignedFirePower: values[3]!,
      pm25Today: values[4]!,
      pm25Tomorrow: values[5]!,
    }];
  });
  const training = days.filter((day) => addDays(day.date, 1) < cutoff);
  const testing = days.filter((day) => addDays(day.date, 1) >= cutoff);
  if (training.length < 2 || testing.length === 0) {
    throw new Error("Validation needs at least two training days and one later testing day.");
  }

  const hotspotModel = linearRegression(training.map((day) => ({ x: day.hotspots, y: day.pm25Tomorrow })));
  const alignedModel = linearRegression(training.map((day) => ({ x: day.alignedHotspots, y: day.pm25Tomorrow })));
  const firePowerModel = linearRegression(training.map((day) => ({ x: day.firePower, y: day.pm25Tomorrow })));
  const alignedFirePowerModel = linearRegression(training.map((day) => ({ x: day.alignedFirePower, y: day.pm25Tomorrow })));
  const errors = {
    persistence: meanAbsoluteError(testing.map((day) => ({ predicted: day.pm25Today, actual: day.pm25Tomorrow }))),
    hotspots: meanAbsoluteError(testing.map((day) => ({
      predicted: hotspotModel.intercept + hotspotModel.slope * day.hotspots,
      actual: day.pm25Tomorrow,
    }))),
    aligned: meanAbsoluteError(testing.map((day) => ({
      predicted: alignedModel.intercept + alignedModel.slope * day.alignedHotspots,
      actual: day.pm25Tomorrow,
    }))),
    firePower: meanAbsoluteError(testing.map((day) => ({
      predicted: firePowerModel.intercept + firePowerModel.slope * day.firePower,
      actual: day.pm25Tomorrow,
    }))),
    alignedFirePower: meanAbsoluteError(testing.map((day) => ({
      predicted: alignedFirePowerModel.intercept + alignedFirePowerModel.slope * day.alignedFirePower,
      actual: day.pm25Tomorrow,
    }))),
  };
  const show = (value: number) => value.toFixed(2);
  const best = [
    { name: "Hotspots alone", error: errors.hotspots },
    { name: "Hotspots plus wind", error: errors.aligned },
    { name: "Fire intensity alone", error: errors.firePower },
    { name: "Fire intensity plus wind", error: errors.alignedFirePower },
  ].reduce((lowest, model) => model.error < lowest.error ? model : lowest);
  const conclusion = best.error < errors.persistence
    ? `${best.name} had ${show(errors.persistence - best.error)} µg/m³ less error than the baseline. This short test is not enough to establish a reliable early-warning predictor.`
    : "None of the fire models beat the simple baseline on these unseen dates. The method is not yet a reliable early-warning predictor.";

  console.log(`HAZESIGNAL — HISTORICAL VALIDATION

TRAINING TARGET DATES
${addDays(training[0]!.date, 1)} to ${addDays(training.at(-1)!.date, 1)} (${training.length} complete days)

UNSEEN TARGET DATES
${addDays(testing[0]!.date, 1)} to ${addDays(testing.at(-1)!.date, 1)} (${testing.length} complete days)

AVERAGE NEXT-DAY ERROR (lower is better)
Tomorrow resembles today:  ${show(errors.persistence)} µg/m³
Fire hotspots only:        ${show(errors.hotspots)} µg/m³
Fire hotspots + wind:      ${show(errors.aligned)} µg/m³
Fire intensity only:       ${show(errors.firePower)} µg/m³
Fire intensity + wind:     ${show(errors.alignedFirePower)} µg/m³

RESULT
${conclusion}

WHY THIS TEST MATTERS
The model learned from the earlier dates, then predicted later dates it had never seen. The “tomorrow resembles today” line is the basic result a useful warning model must beat.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
