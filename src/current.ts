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
  pm25: { value: number; unit: string; place: string; measuredAt: string };
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

function localTime(iso: string): string {
  return new Intl.DateTimeFormat("en-MY", {
    timeZone: "Asia/Kuala_Lumpur",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(iso));
}

export function formatCurrentReport(report: CurrentReport): string {
  const strongest = report.fires.reduce((best, fire) => fire.alignment > best.alignment ? fire : best);
  const clue = strongest.count > 0 && strongest.alignment >= 0.5
    ? `Possible warning clue: fires were detected and the wind points roughly from ${strongest.region} toward Kuala Lumpur. This is not a forecast.`
    : "No clear fire-and-wind warning clue at this moment. Conditions can change quickly.";
  const fireLines = report.fires.map((fire) =>
    `${fire.region[0]?.toUpperCase()}${fire.region.slice(1)}: ${fire.count} recent hotspots; wind match ${Math.round(fire.alignment * 100)}%`
  ).join("\n");

  return `HazeSignal current check
Checked: ${localTime(report.checkedAt)}

AIR NOW
PM2.5 now: ${report.pm25.value} ${report.pm25.unit} at ${report.pm25.place}
Monitor time: ${localTime(report.pm25.measuredAt)}
This ground reading tells you what the air is like now. Use Malaysia's official APIMS reading for health decisions.

POSSIBLE INCOMING HAZE
Recent means the last two days of NASA satellite detections.
${fireLines}
Wind now: ${report.wind.speed} km/h, coming from ${report.wind.direction}°
${clue}

Hotspots are possible fires, not haze measurements. Wind match is 100% when the wind points directly from that region toward Kuala Lumpur, and 0% when it blows sideways or away.`;
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
      return { value, unit: sensor?.parameter?.units ?? "µg/m³", place: candidate.place, measuredAt };
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
