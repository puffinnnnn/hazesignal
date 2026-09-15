import assert from "node:assert/strict";
import test from "node:test";

import { parseCsv, validateDateRange } from "../src/csv.js";
import {
  alignmentScore,
  combineDailyData,
  dailyWind,
  initialBearing,
  isUsablePm25,
  linearRegression,
  meanAbsoluteError,
  windTravelBearing,
} from "../src/analysis.js";
import { fetchFirms, fetchWithRetry } from "../src/fetch_firms.js";
import { formatCurrentReport, isPm25MassUnit, median, pm25Category } from "../src/current.js";

test("parseCsv keeps commas inside quoted fields", () => {
  const rows = parseCsv<{ name: string; note: string }>('name,note\nKL,"hot, hazy"\n');
  assert.deepEqual(rows, [{ name: "KL", note: "hot, hazy" }]);
});

test("validateDateRange rejects an end date before the start", () => {
  assert.throws(
    () => validateDateRange("2019-09-30", "2019-09-01"),
    /end date must be on or after start date/i,
  );
});

test("initialBearing returns simple north and east bearings", () => {
  assert.equal(initialBearing(0, 0, 1, 0), 0);
  assert.equal(initialBearing(0, 0, 0, 1), 90);
});

test("wind alignment converts meteorological direction into travel direction", () => {
  assert.equal(windTravelBearing(225), 45);
  assert.ok(Math.abs(alignmentScore(225, 45) - 1) < 1e-12);
  assert.equal(alignmentScore(45, 45), 0);
});

test("dailyWind averages directions across zero degrees", () => {
  const [day] = dailyWind([
    { date: "2019-09-01", wind_speed_kmh: 10, wind_direction_degrees: 350 },
    { date: "2019-09-01", wind_speed_kmh: 10, wind_direction_degrees: 10 },
  ]);
  assert.ok(day);
  assert.equal(day.wind_speed_kmh, 10);
  assert.ok(day.wind_direction_degrees < 1 || day.wind_direction_degrees > 359);
});

test("combineDailyData joins PM2.5 by calendar-day leads", () => {
  const rows = combineDailyData(
    [
      { acq_date: "2019-09-01", frp: "10", region: "sumatra" },
      { acq_date: "2019-09-01", frp: 20, region: "sumatra" },
    ],
    [{
      date: "2019-09-01",
      wind_speed_kmh: 10,
      wind_direction_degrees: 225,
      observations: 24,
    }],
    [
      { date: "2019-09-01", pm25_ug_m3: 20 },
      { date: "2019-09-02", pm25_ug_m3: 30 },
      { date: "2019-09-03", pm25_ug_m3: 40 },
    ],
  );
  assert.equal(rows[0]?.hotspot_count, 2);
  assert.equal(rows[0]?.fire_radiative_power_mw, 30);
  assert.ok((rows[0]?.aligned_fire_radiative_power_mw ?? 0) <= 30);
  assert.equal(rows[0]?.pm25_next_day, 30);
  assert.equal(rows[0]?.pm25_in_two_days, 40);
});

test("combineDailyData groups UTC fire detections by Malaysia date", () => {
  const rows = combineDailyData(
    [{ acq_date: "2019-09-01", acq_time: "1800", region: "sumatra" }],
    [
      { date: "2019-09-01", wind_speed_kmh: 10, wind_direction_degrees: 225, observations: 24 },
      { date: "2019-09-02", wind_speed_kmh: 10, wind_direction_degrees: 225, observations: 24 },
    ],
    [],
  );

  assert.equal(rows[0]?.hotspot_count, 0);
  assert.equal(rows[1]?.hotspot_count, 1);
});

test("linearRegression fits a perfect straight line", () => {
  const result = linearRegression([
    { x: 1, y: 3 },
    { x: 2, y: 5 },
    { x: 3, y: 7 },
  ]);
  assert.equal(result.slope, 2);
  assert.equal(result.intercept, 1);
  assert.ok(Math.abs(result.r - 1) < 1e-12);
  assert.ok(Math.abs(result.rSquared - 1) < 1e-12);
});

test("meanAbsoluteError reports typical prediction distance", () => {
  assert.equal(meanAbsoluteError([
    { predicted: 10, actual: 8 },
    { predicted: 5, actual: 4 },
  ]), 1.5);
});

test("PM2.5 readings need known coverage of at least 75%", () => {
  assert.equal(isUsablePm25(40.6, 29), false);
  assert.equal(isUsablePm25(20, 75), true);
  assert.equal(isUsablePm25(20), false);
});

test("fetchWithRetry retries temporary network failures", async () => {
  let attempts = 0;
  const request = async () => {
    attempts += 1;
    if (attempts < 3) throw new Error("fetch failed");
    return new Response("ok");
  };

  const response = await fetchWithRetry("https://example.test", request as typeof fetch, 0);

  assert.equal(await response.text(), "ok");
  assert.equal(attempts, 3);
});

test("fetchWithRetry retries temporary HTTP responses", async () => {
  let attempts = 0;
  const request = async () => {
    attempts += 1;
    return attempts === 1 ? new Response("busy", { status: 503 }) : new Response("ok");
  };

  const response = await fetchWithRetry("https://example.test", request as typeof fetch, 0);

  assert.equal(response.status, 200);
  assert.equal(attempts, 2);
});

test("fetchFirms includes the previous UTC day and keeps only Malaysia study dates", async () => {
  const requestedDates: string[] = [];
  const request = async (url: string | URL | Request) => {
    const date = String(url).split("/").at(-1) ?? "";
    requestedDates.push(date);
    const rows = date === "2019-08-31"
      ? "0,101,2019-08-31,1000\n0,101,2019-08-31,1800"
      : "0,101,2019-09-01,1000\n0,101,2019-09-01,1800";
    return new Response(`latitude,longitude,acq_date,acq_time\n${rows}\n`);
  };

  const rows = await fetchFirms("2019-09-01", "2019-09-01", "test-key", request as typeof fetch);

  assert.ok(requestedDates.includes("2019-08-31"));
  assert.equal(rows.length, 4);
  assert.ok(rows.every((row) => row.local_date === "2019-09-01"));
});

test("current report explains readings without claiming a forecast", () => {
  const report = formatCurrentReport({
    checkedAt: "2026-09-14T14:00:00.000Z",
    pm25: {
      average24h: 80,
      monitorCount: 5,
      rangeLow: 74,
      rangeHigh: 91,
      unit: "µg/m³",
    },
    wind: { speed: 9.2, direction: 225 },
    fires: [
      { region: "sumatra", count: 120, alignment: 0.9 },
      { region: "kalimantan", count: 40, alignment: 0 },
    ],
  });

  assert.match(report, /HAZESIGNAL — KUALA LUMPUR/);
  assert.match(report, /AIR TODAY: UNHEALTHY/);
  assert.match(report, /Unhealthy\s+50\.5–150\.4\s+← CURRENT: 80/);
  assert.match(report, /80 is unhealthy\. 160 is very unhealthy\./i);
  assert.match(report, /NEXT 1–2 DAYS: WARNING CLUE PRESENT/);
  assert.match(report, /ACTION/);
  assert.match(report, /5 nearby monitors.*74–91 µg\/m³/i);
  assert.doesNotMatch(report, /incomplete combustion/i);
});

test("PM2.5 category follows Malaysia DOE concentration bands", () => {
  assert.equal(pm25Category(12).name, "GOOD");
  assert.equal(pm25Category(30).name, "MODERATE");
  assert.equal(pm25Category(80).name, "UNHEALTHY");
  assert.equal(pm25Category(200).name, "VERY UNHEALTHY");
  assert.equal(pm25Category(300).name, "HAZARDOUS");
});

test("median resists one extreme monitor reading", () => {
  assert.equal(median([79, 80, 81, 82, 500]), 81);
});

test("PM2.5 categories only accept micrograms per cubic metre", () => {
  assert.equal(isPm25MassUnit("µg/m³"), true);
  assert.equal(isPm25MassUnit("ug/m3"), true);
  assert.equal(isPm25MassUnit("mg/m³"), false);
});
