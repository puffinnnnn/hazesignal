import { pathToFileURL } from "node:url";

import { isUsablePm25 } from "./analysis.js";
import { percentile } from "./current.js";
import { addDays, readCsv } from "./csv.js";

export interface WarningDay {
  date: string;
  aligned: number;
  pm25: number | null;
  coverage: number | null;
}

export function backtestWarning(training: WarningDay[], testing: WarningDay[]) {
  if (training.length < 2 || testing.length < 4) throw new Error("The backtest needs at least two training and four testing dates.");
  for (const [name, days] of [["Training", training], ["Testing", testing]] as const) {
    for (let index = 1; index < days.length; index += 1) {
      if (addDays(days[index - 1]!.date, 1) !== days[index]!.date) {
        throw new Error(`${name} dates must be ordered, unique and consecutive.`);
      }
    }
  }
  if (training.at(-1)!.date >= testing[0]!.date) {
    throw new Error("Testing dates must follow the training dates.");
  }
  const trainingSignals = training.slice(1).map((day, index) => day.aligned + training[index]!.aligned);
  const threshold = percentile(trainingSignals, 0.9);
  if (!Number.isFinite(threshold) || threshold <= 0) throw new Error("The fire-signal threshold must be positive and finite.");

  let eligible = 0;
  let events = 0;
  let warnings = 0;
  let caught = 0;
  let falseAlarms = 0;
  for (let index = 1; index < testing.length - 2; index += 1) {
    const yesterday = testing[index - 1]!;
    const today = testing[index]!;
    const tomorrow = testing[index + 1]!;
    const dayAfter = testing[index + 2]!;
    if (![today, tomorrow, dayAfter].every((day) => isUsablePm25(day.pm25, day.coverage))) continue;
    if (today.pm25! >= 50.5) continue; // An already-unhealthy day is not a new early-warning opportunity.

    const event = tomorrow.pm25! >= 50.5 || dayAfter.pm25! >= 50.5;
    const warning = today.aligned + yesterday.aligned >= threshold;
    eligible += 1;
    if (event) events += 1;
    if (warning) warnings += 1;
    if (event && warning) caught += 1;
    if (!event && warning) falseAlarms += 1;
  }
  return { threshold, eligible, events, warnings, caught, missed: events - caught, falseAlarms };
}

function numberOrNull(value: string | undefined): number | null {
  if (value == null || value.trim() === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

async function loadDays(path: string): Promise<WarningDay[]> {
  const rows = await readCsv<Record<string, string>>(path);
  return rows.map((row) => {
    const aligned = numberOrNull(row.aligned_hotspot_count);
    if (!row.date || aligned == null || aligned < 0) throw new Error(`Invalid fire signal in ${path}.`);
    return {
      date: row.date,
      aligned,
      pm25: numberOrNull(row.pm25_ug_m3),
      coverage: numberOrNull(row.pm25_coverage_percent),
    };
  });
}

async function main(): Promise<void> {
  const trainingPath = process.argv[2] ?? "data/validation_2023.csv";
  const testingPath = process.argv[3] ?? "data/validation_2025.csv";
  const result = backtestWarning(await loadDays(trainingPath), await loadDays(testingPath));
  console.log(`HAZESIGNAL — INDEPENDENT WARNING CHECK

Training fire signal: ${trainingPath}
Later test season: ${testingPath}
Historical high-signal threshold: ${Math.round(result.threshold)}

Question: while today's PM2.5 is below 50.5 µg/m³, does it enter the unhealthy band in the next two days?
Eligible issue dates: ${result.eligible}
Dates with an upcoming unhealthy reading: ${result.events}
Warnings issued: ${result.warnings}
Caught: ${result.caught}
Missed: ${result.missed}
False alarms: ${result.falseAlarms}

${result.warnings === 0 ? "No warnings were issued, so a false-alarm percentage cannot be estimated." : "A warning is counted as a false alarm when neither following day reaches the unhealthy band."}
${result.events === 0 ? "No unhealthy events occurred, so a detection percentage cannot be estimated." : `${result.missed} of ${result.events} eligible warning opportunities were missed.`}

An unhealthy day can create two warning opportunities, so these counts are not separate haze episodes.
This is an end-of-day historical comparison, not a replay of every live run. It uses complete daily wind, standard-processed fire detections and two different PM2.5 monitors. The live check uses near-real-time detections. This test cannot establish forecast skill.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
