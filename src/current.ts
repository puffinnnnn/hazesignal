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

export function pm25Category(value: number): Pm25Category {
  if (value <= 12) return {
    name: "GOOD",
    meaning: "The amount of fine-particle pollution is low.",
    action: "Normal outdoor activities are generally reasonable. Check APIMS if you are especially sensitive.",
  };
  if (value <= 50.4) return {
    name: "MODERATE",
    meaning: "Fine-particle pollution is raised, although most people may not notice effects.",
    action: "Monitor APIMS. If you are sensitive to pollution and feel symptoms, reduce long or strenuous outdoor activity.",
  };
  if (value <= 150.4) return {
    name: "UNHEALTHY",
    meaning: "The monitor is showing a high amount of fine-particle pollution.",
    action: "Reduce long or strenuous outdoor activity. Children, older adults, and people with heart, lung, or asthma conditions should be especially cautious.",
  };
  if (value <= 250.4) return {
    name: "VERY UNHEALTHY",
    meaning: "Fine-particle pollution is very high and may affect everyone.",
    action: "Avoid strenuous outdoor activity and reduce time outdoors. Follow current APIMS health advice.",
  };
  return {
    name: "HAZARDOUS",
    meaning: "Fine-particle pollution is extremely high.",
    action: "Avoid outdoor activity where possible and follow official health or emergency instructions immediately.",
  };
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
  const today = category ? `${category.name} PARTICLE POLLUTION` : "NOT ENOUGH 24-HOUR DATA";
  const tomorrow = hasClue ? "WARNING CLUE PRESENT" : "NO CLEAR WARNING CLUE";
  const fireLines = report.fires.map((fire) =>
    `- ${fire.region[0]?.toUpperCase()}${fire.region.slice(1)}: ${fire.count} satellite detections; wind match ${Math.round(fire.alignment * 100)}%`
  ).join("\n");
  const airExplanation = category
    ? `24-hour average: ${report.pm25.average24h} ${report.pm25.unit} from ${report.pm25.hoursUsed} hourly readings
Meaning: ${category.meaning}
This is a PM2.5-only estimate using Malaysia DOE concentration bands. It is not the official API, which also checks other pollutants.`
    : `Only ${report.pm25.hoursUsed} of the last 24 hourly readings were available, so HazeSignal will not guess an air-quality category.`;
  const clueExplanation = hasClue
    ? `Fires were detected and the current wind points roughly from ${strongest.region[0]?.toUpperCase()}${strongest.region.slice(1)} toward Kuala Lumpur.
This means smoke transport is possible. The research is not yet strong enough to say that tomorrow will be dangerous.`
    : "The recent fire detections and current wind do not form a clear incoming-haze clue. Conditions can still change.";
  const action = category?.action ?? "Check APIMS for the official current category before making outdoor plans.";

  return `HAZESIGNAL — PLAIN-LANGUAGE CHECK
Checked: ${localTime(report.checkedAt)}

TODAY: ${today}
Location: ${report.pm25.place}
${airExplanation}

TOMORROW: ${tomorrow} — NOT A FORECAST
${clueExplanation}

WHAT YOU SHOULD DO
${action}
Official Malaysian reading: https://apims.doe.gov.my/

WHY THESE NUMBERS MATTER
PM2.5 means airborne particles no wider than about 2.5 micrometres. They are small enough to travel deep into the lungs.
The unit ${report.pm25.unit} means micrograms of particles in one cubic metre of air. A microgram is one-millionth of a gram; a cubic metre is a 1 m × 1 m × 1 m cube.
Peat and plant material can burn through incomplete combustion, producing soot, ash, and organic aerosol particles. Wind can keep these materials suspended and carry them over long distances.

DETAILS FOR CHECKING THE RESULT
Latest PM2.5 reading: ${report.pm25.value} ${report.pm25.unit} at ${localTime(report.pm25.measuredAt)}
Hotspots below are satellite detections from the last two days, not separate fires and not direct haze measurements:
${fireLines}
Wind now: ${report.wind.speed} km/h, coming from ${report.wind.direction}°
Wind match is 100% when air points directly from the region toward Kuala Lumpur, and 0% when it moves sideways or away.`;
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
