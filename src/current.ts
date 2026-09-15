import "dotenv/config";

import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import {
  alignmentScore,
  dailyWind,
  initialBearing,
  KUALA_LUMPUR,
  malaysiaFireDate,
  SOURCE_CENTROIDS,
  type DailyWind,
  type FireHotspot,
  type HourlyWind,
} from "./analysis.js";
import { parseCsv, readCsv } from "./csv.js";
import { FIRE_REGIONS, FIRMS_URL, fetchWithRetry } from "./fetch_firms.js";

const OPENAQ_URL = "https://api.openaq.org/v3";
const CURRENT_FIRMS_SENSOR = "VIIRS_SNPP_NRT";

type RegionName = keyof typeof SOURCE_CENTROIDS;

interface CurrentReport {
  checkedAt: string;
  pm25: {
    average24h: number | null;
    monitorCount: number;
    rangeLow: number | null;
    rangeHigh: number | null;
    unit: string;
  };
  wind: { speed: number; direction: number };
  fires: Array<{ region: RegionName; count: number; alignment: number }>;
  highSignalThreshold: number;
}

interface OpenAqLocation {
  name: string;
  distance?: number;
  sensors?: Array<{ id: number; parameter?: { name?: string } }>;
}

interface OpenAqSensor {
  latest?: { value?: number; datetime?: { utc?: string } };
  parameter?: { units?: string };
}

interface Pm25Category {
  name: "GOOD" | "MODERATE" | "UNHEALTHY" | "VERY UNHEALTHY" | "HAZARDOUS";
  meaning: string;
  action: string;
}

const PM25_BANDS = [
  {
    max: 12,
    label: "Good",
    range: "0–12",
    name: "GOOD",
    meaning: "The amount of fine-particle pollution is low.",
    action: "Normal outdoor activities are generally reasonable. Check APIMS if you are especially sensitive.",
  },
  {
    max: 50.4,
    label: "Moderate",
    range: "12.1–50.4",
    name: "MODERATE",
    meaning: "Fine-particle pollution is raised, although most people may not notice effects.",
    action: "Monitor APIMS. If you are sensitive to pollution and feel symptoms, reduce long or strenuous outdoor activity.",
  },
  {
    max: 150.4,
    label: "Unhealthy",
    range: "50.5–150.4",
    name: "UNHEALTHY",
    meaning: "The monitor is showing a high amount of fine-particle pollution.",
    action: "Reduce long or strenuous outdoor activity. Children, older adults, and people with heart, lung, or asthma conditions should be especially cautious.",
  },
  {
    max: 250.4,
    label: "Very unhealthy",
    range: "150.5–250.4",
    name: "VERY UNHEALTHY",
    meaning: "Fine-particle pollution is very high and may affect everyone.",
    action: "Avoid strenuous outdoor activity and reduce time outdoors. Follow current APIMS health advice.",
  },
  {
    max: Infinity,
    label: "Hazardous",
    range: "above 250.4",
    name: "HAZARDOUS",
    meaning: "Fine-particle pollution is extremely high.",
    action: "Avoid outdoor activity where possible and follow official health or emergency instructions immediately.",
  },
] as const;

export function pm25Category(value: number): Pm25Category {
  return PM25_BANDS.find((band) => value <= band.max) ?? PM25_BANDS.at(-1)!;
}

export function median(values: number[]): number {
  if (values.length === 0) throw new Error("Median needs at least one value.");
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[middle]!
    : (sorted[middle - 1]! + sorted[middle]!) / 2;
}

export function percentile(values: number[], proportion: number): number {
  if (values.length === 0 || proportion < 0 || proportion > 1) {
    throw new Error("Percentile needs values and a proportion from 0 to 1.");
  }
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.ceil(proportion * sorted.length) - 1] ?? sorted[0]!;
}

export function isPm25MassUnit(unit: string | undefined): boolean {
  const normalised = unit?.trim().toLowerCase().replace("μ", "µ").replace("³", "3");
  return normalised === "µg/m3" || normalised === "ug/m3";
}

function localTime(iso: string): string {
  return new Intl.DateTimeFormat("en-MY", {
    timeZone: "Asia/Kuala_Lumpur",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(iso));
}

export function formatCurrentReport(report: CurrentReport): string {
  if (!(report.highSignalThreshold > 0)) throw new Error("The historical high-signal threshold must be positive.");
  const strongest = report.fires.reduce((best, fire) => fire.alignment > best.alignment ? fire : best);
  const signal = report.fires.reduce((sum, fire) => sum + fire.count * fire.alignment, 0);
  const hasClue = signal >= report.highSignalThreshold;
  const category = report.pm25.average24h == null ? null : pm25Category(report.pm25.average24h);
  const today = category?.name ?? "NOT ENOUGH DATA";
  const tomorrow = hasClue ? "WARNING CLUE PRESENT" : "NO CLEAR WARNING CLUE";
  const scale = PM25_BANDS.map((band) => {
    const marker = band.name === category?.name ? `   ← CURRENT: ${report.pm25.average24h}` : "";
    return `${band.label.padEnd(16)} ${band.range.padEnd(12)}${marker}`;
  }).join("\n");
  const airReading = category
    ? `KL-area 24-hour PM2.5 estimate: ${report.pm25.average24h} ${report.pm25.unit}`
    : "Not enough complete, recent monitor data was available, so no category was estimated.";
  const clueExplanation = hasClue
    ? "Recent fires and wind direction could allow smoke to travel toward Kuala Lumpur."
    : "Recent fire detections and current wind do not form a clear incoming-haze clue.";
  const action = category?.action ?? "Check APIMS for the official current category before making outdoor plans.";
  const sumatra = report.fires.find((fire) => fire.region === "sumatra")?.count ?? 0;
  const kalimantan = report.fires.find((fire) => fire.region === "kalimantan")?.count ?? 0;
  const strongestName = `${strongest.region[0]?.toUpperCase()}${strongest.region.slice(1)}`;

  return `HAZESIGNAL — KUALA LUMPUR
Checked: ${localTime(report.checkedAt)}

AIR TODAY: ${today}
${airReading}

MALAYSIA PM2.5 SCALE (24-HOUR AVERAGE, ${report.pm25.unit})
${scale}

80 is unhealthy. 160 is very unhealthy.
“Good” is the lowest band, but it does not mean completely risk-free.
This is a PM2.5-only estimate, not the official Malaysian API.

NEXT 1–2 DAYS: ${tomorrow}
${clueExplanation}
The research cannot yet reliably predict how severe the haze will be.

ACTION
${action}
Official Malaysian reading: https://apims.doe.gov.my/

EVIDENCE
PM2.5 monitors: ${report.pm25.monitorCount} nearby monitors (24-hour range ${report.pm25.rangeLow ?? "?"}–${report.pm25.rangeHigh ?? "?"} ${report.pm25.unit})
Fire detections: Sumatra ${sumatra} | Kalimantan ${kalimantan}
Strongest wind match: ${strongestName} ${Math.round(strongest.alignment * 100)}%
Two-day fire-and-wind signal: ${Math.round(signal)} (historical high threshold ${Math.round(report.highSignalThreshold)}; ${(signal / report.highSignalThreshold).toFixed(1)}× this threshold)

Hotspots are satellite detections, not separate fires. See README.md for definitions and scientific details.`;
}

async function loadHighSignalThreshold(): Promise<number> {
  const rows = await readCsv<{ aligned_hotspot_count: string }>(resolve("data/validation_2023.csv"));
  const daily = rows.map((row) => Number(row.aligned_hotspot_count));
  if (daily.some((value) => !Number.isFinite(value)) || daily.length < 2) {
    throw new Error("Historical validation data cannot calibrate the current warning clue.");
  }
  const twoDaySignals = daily.slice(1).map((value, index) => value + daily[index]!);
  return percentile(twoDaySignals, 0.9);
}

async function fetch24HourAverage(
  sensorId: number,
  apiKey: string,
  measuredAt: string,
): Promise<{ average24h: number | null; hoursUsed: number }> {
  const end = new Date(measuredAt);
  const start = new Date(end.getTime() - 24 * 3_600_000);
  const query = new URLSearchParams({
    datetime_from: start.toISOString(),
    datetime_to: end.toISOString(),
    limit: "100",
  });
  const response = await fetch(`${OPENAQ_URL}/sensors/${sensorId}/hours?${query}`, {
    headers: { "X-API-Key": apiKey },
  });
  if (!response.ok) return { average24h: null, hoursUsed: 0 };
  const rows = (await response.json() as {
    results?: Array<{ value?: number; flagInfo?: { hasFlags?: boolean } }>;
  }).results ?? [];
  const values = rows.flatMap((row) =>
    typeof row.value === "number" && row.value >= 0 && row.flagInfo?.hasFlags !== true ? [row.value] : []
  );
  const average = values.reduce((sum, value) => sum + value, 0) / values.length;
  return {
    average24h: values.length >= 18 ? Math.round(average * 10) / 10 : null,
    hoursUsed: values.length,
  };
}

async function fetchCurrentPm25(apiKey: string): Promise<CurrentReport["pm25"]> {
  const query = new URLSearchParams({
    coordinates: `${KUALA_LUMPUR.latitude},${KUALA_LUMPUR.longitude}`,
    radius: "25000",
    limit: "100",
  });
  const headers = { "X-API-Key": apiKey };
  const response = await fetch(`${OPENAQ_URL}/locations?${query}`, { headers });
  if (!response.ok) throw new Error(`OpenAQ location request failed (${response.status}). Check OPENAQ_API_KEY.`);
  const locations = (await response.json() as { results?: OpenAqLocation[] }).results;
  if (!Array.isArray(locations)) throw new Error("OpenAQ returned an unexpected location response.");

  const candidates = locations.flatMap((location) =>
    (location.sensors ?? [])
      .filter((sensor) => sensor.parameter?.name?.toLowerCase() === "pm25")
      .map((sensor) => ({ ...sensor, place: location.name, distance: location.distance ?? Infinity }))
  ).sort((a, b) => a.distance - b.distance);

  const readings: number[] = [];
  let unit = "µg/m³";
  for (const candidate of candidates) {
    const sensorResponse = await fetch(`${OPENAQ_URL}/sensors/${candidate.id}`, { headers });
    if (!sensorResponse.ok) continue;
    const sensor = (await sensorResponse.json() as { results?: OpenAqSensor[] }).results?.[0];
    const value = sensor?.latest?.value;
    const measuredAt = sensor?.latest?.datetime?.utc;
    const sensorUnit = sensor?.parameter?.units;
    const ageHours = measuredAt ? (Date.now() - Date.parse(measuredAt)) / 3_600_000 : Infinity;
    if (typeof value === "number" && measuredAt && isPm25MassUnit(sensorUnit) && ageHours >= -1 && ageHours <= 48) {
      const recent = await fetch24HourAverage(candidate.id, apiKey, measuredAt);
      if (recent.average24h != null) {
        readings.push(recent.average24h);
        unit = "µg/m³";
        if (readings.length === 5) break;
      }
    }
  }
  if (readings.length === 0) {
    return { average24h: null, monitorCount: 0, rangeLow: null, rangeHigh: null, unit };
  }
  return {
    average24h: Math.round(median(readings) * 10) / 10,
    monitorCount: readings.length,
    rangeLow: Math.min(...readings),
    rangeHigh: Math.max(...readings),
    unit,
  };
}

async function fetchCurrentWind(): Promise<{ current: CurrentReport["wind"]; daily: DailyWind[] }> {
  const query = new URLSearchParams({
    latitude: String(KUALA_LUMPUR.latitude),
    longitude: String(KUALA_LUMPUR.longitude),
    current: "wind_speed_10m,wind_direction_10m",
    hourly: "wind_speed_10m,wind_direction_10m",
    past_days: "1",
    forecast_days: "1",
    timezone: "Asia/Kuala_Lumpur",
  });
  const response = await fetch(`https://api.open-meteo.com/v1/forecast?${query}`);
  if (!response.ok) throw new Error(`Open-Meteo request failed (${response.status}).`);
  const weather = await response.json() as {
    current?: { time?: string; wind_speed_10m?: number; wind_direction_10m?: number };
    hourly?: { time?: string[]; wind_speed_10m?: number[]; wind_direction_10m?: number[] };
  };
  const current = weather.current;
  if (typeof current?.wind_speed_10m !== "number" || typeof current.wind_direction_10m !== "number") {
    throw new Error("Open-Meteo returned an unexpected wind response.");
  }
  const times = weather.hourly?.time ?? [];
  const speeds = weather.hourly?.wind_speed_10m ?? [];
  const directions = weather.hourly?.wind_direction_10m ?? [];
  const hours: HourlyWind[] = times.flatMap((time, index) =>
    time <= (current.time ?? "") && typeof speeds[index] === "number" && typeof directions[index] === "number"
      ? [{ date: time.slice(0, 10), wind_speed_kmh: speeds[index]!, wind_direction_degrees: directions[index]! }]
      : []
  );
  if (hours.length === 0) throw new Error("Open-Meteo returned no recent hourly wind observations.");
  return {
    current: { speed: current.wind_speed_10m, direction: current.wind_direction_10m },
    daily: dailyWind(hours),
  };
}

export function summariseCurrentFires(
  rows: FireHotspot[],
  region: RegionName,
  winds: DailyWind[],
): CurrentReport["fires"][number] {
  const source = SOURCE_CENTROIDS[region];
  const route = initialBearing(source.latitude, source.longitude, KUALA_LUMPUR.latitude, KUALA_LUMPUR.longitude);
  const windByDate = new Map(winds.map((wind) => [wind.date, wind]));
  const alignment = rows.reduce((sum, fire) => {
    const wind = windByDate.get(malaysiaFireDate(fire));
    if (!wind) throw new Error(`No matching wind data for FIRMS detection on ${fire.acq_date}.`);
    return sum + alignmentScore(wind.wind_direction_degrees, route);
  }, 0);
  return { region, count: rows.length, alignment: rows.length === 0 ? 0 : alignment / rows.length };
}

async function fetchCurrentFires(mapKey: string, winds: DailyWind[]): Promise<CurrentReport["fires"]> {
  return Promise.all(FIRE_REGIONS.map(async (region) => {
    const url = `${FIRMS_URL}/${mapKey}/${CURRENT_FIRMS_SENSOR}/${region.bbox}/2`;
    const response = await fetchWithRetry(url);
    if (!response.ok) throw new Error(`NASA FIRMS request failed (${response.status}) for ${region.name}. Check FIRMS_MAP_KEY.`);
    const rows = parseCsv<Omit<FireHotspot, "region">>(await response.text())
      .map((row) => ({ ...row, region: region.name }));
    return summariseCurrentFires(rows, region.name, winds);
  }));
}

async function main(): Promise<void> {
  const mapKey = process.env.FIRMS_MAP_KEY;
  const openAqKey = process.env.OPENAQ_API_KEY;
  if (!mapKey || !openAqKey) throw new Error("Add FIRMS_MAP_KEY and OPENAQ_API_KEY to .env first.");

  const [pm25, wind] = await Promise.all([fetchCurrentPm25(openAqKey), fetchCurrentWind()]);
  const fires = await fetchCurrentFires(mapKey, wind.daily);
  const highSignalThreshold = await loadHighSignalThreshold();
  console.log(formatCurrentReport({ checkedAt: new Date().toISOString(), pm25, wind: wind.current, fires, highSignalThreshold }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
