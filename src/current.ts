import "dotenv/config";

import { pathToFileURL } from "node:url";

import { alignmentScore, initialBearing, KUALA_LUMPUR, SOURCE_CENTROIDS } from "./analysis.js";
import { parseCsv } from "./csv.js";
import { FIRE_REGIONS, FIRMS_URL, fetchWithRetry } from "./fetch_firms.js";

const OPENAQ_URL = "https://api.openaq.org/v3";
const CURRENT_FIRMS_SENSOR = "VIIRS_SNPP_NRT";

type RegionName = keyof typeof SOURCE_CENTROIDS;

interface CurrentReport {
  checkedAt: string;
  pm25: {
    value: number;
    average24h: number | null;
    hoursUsed: number;
    unit: string;
    place: string;
    measuredAt: string;
  };
  wind: { speed: number; direction: number };
  fires: Array<{ region: RegionName; count: number; alignment: number }>;
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

function localTime(iso: string): string {
  return new Intl.DateTimeFormat("en-MY", {
    timeZone: "Asia/Kuala_Lumpur",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(iso));
}

export function formatCurrentReport(report: CurrentReport): string {
  const strongest = report.fires.reduce((best, fire) => fire.alignment > best.alignment ? fire : best);
  const hasClue = strongest.count > 0 && strongest.alignment >= 0.5;
  const category = report.pm25.average24h == null ? null : pm25Category(report.pm25.average24h);
  const today = category?.name ?? "NOT ENOUGH DATA";
  const tomorrow = hasClue ? "WARNING CLUE PRESENT" : "NO CLEAR WARNING CLUE";
  const scale = PM25_BANDS.map((band) => {
    const marker = band.name === category?.name ? `   ← CURRENT: ${report.pm25.average24h}` : "";
    return `${band.label.padEnd(16)} ${band.range.padEnd(12)}${marker}`;
  }).join("\n");
  const airReading = category
    ? `24-hour PM2.5 average: ${report.pm25.average24h} ${report.pm25.unit}`
    : `Only ${report.pm25.hoursUsed} of 24 hourly readings were available, so no category was estimated.`;
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
PM2.5 monitor: ${report.pm25.place} (${report.pm25.hoursUsed} hourly readings)
Fire detections: Sumatra ${sumatra} | Kalimantan ${kalimantan}
Strongest wind match: ${strongestName} ${Math.round(strongest.alignment * 100)}%

Hotspots are satellite detections, not separate fires. See README.md for definitions and scientific details.`;
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
  const rows = (await response.json() as { results?: Array<{ value?: number }> }).results ?? [];
  const values = rows.flatMap((row) => typeof row.value === "number" && row.value >= 0 ? [row.value] : []);
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

  for (const candidate of candidates) {
    const sensorResponse = await fetch(`${OPENAQ_URL}/sensors/${candidate.id}`, { headers });
    if (!sensorResponse.ok) continue;
    const sensor = (await sensorResponse.json() as { results?: OpenAqSensor[] }).results?.[0];
    const value = sensor?.latest?.value;
    const measuredAt = sensor?.latest?.datetime?.utc;
    const ageHours = measuredAt ? (Date.now() - Date.parse(measuredAt)) / 3_600_000 : Infinity;
    if (typeof value === "number" && measuredAt && ageHours >= -1 && ageHours <= 48) {
      const recent = await fetch24HourAverage(candidate.id, apiKey, measuredAt);
      return {
        value,
        ...recent,
        unit: sensor?.parameter?.units ?? "µg/m³",
        place: candidate.place,
        measuredAt,
      };
    }
  }
  throw new Error("OpenAQ has no PM2.5 monitor near Kuala Lumpur updated within the last 48 hours.");
}

async function fetchCurrentWind(): Promise<CurrentReport["wind"]> {
  const query = new URLSearchParams({
    latitude: String(KUALA_LUMPUR.latitude),
    longitude: String(KUALA_LUMPUR.longitude),
    current: "wind_speed_10m,wind_direction_10m",
  });
  const response = await fetch(`https://api.open-meteo.com/v1/forecast?${query}`);
  if (!response.ok) throw new Error(`Open-Meteo request failed (${response.status}).`);
  const current = (await response.json() as { current?: { wind_speed_10m?: number; wind_direction_10m?: number } }).current;
  if (typeof current?.wind_speed_10m !== "number" || typeof current.wind_direction_10m !== "number") {
    throw new Error("Open-Meteo returned an unexpected wind response.");
  }
  return { speed: current.wind_speed_10m, direction: current.wind_direction_10m };
}

async function fetchCurrentFires(mapKey: string, windDirection: number): Promise<CurrentReport["fires"]> {
  return Promise.all(FIRE_REGIONS.map(async (region) => {
    const url = `${FIRMS_URL}/${mapKey}/${CURRENT_FIRMS_SENSOR}/${region.bbox}/2`;
    const response = await fetchWithRetry(url);
    if (!response.ok) throw new Error(`NASA FIRMS request failed (${response.status}) for ${region.name}. Check FIRMS_MAP_KEY.`);
    const rows = parseCsv<Record<string, string>>(await response.text());
    const source = SOURCE_CENTROIDS[region.name];
    const route = initialBearing(source.latitude, source.longitude, KUALA_LUMPUR.latitude, KUALA_LUMPUR.longitude);
    return { region: region.name, count: rows.length, alignment: alignmentScore(windDirection, route) };
  }));
}

async function main(): Promise<void> {
  const mapKey = process.env.FIRMS_MAP_KEY;
  const openAqKey = process.env.OPENAQ_API_KEY;
  if (!mapKey || !openAqKey) throw new Error("Add FIRMS_MAP_KEY and OPENAQ_API_KEY to .env first.");

  const [pm25, wind] = await Promise.all([fetchCurrentPm25(openAqKey), fetchCurrentWind()]);
  const fires = await fetchCurrentFires(mapKey, wind.direction);
  console.log(formatCurrentReport({ checkedAt: new Date().toISOString(), pm25, wind, fires }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
