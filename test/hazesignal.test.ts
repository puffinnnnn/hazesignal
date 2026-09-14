import assert from "node:assert/strict";
import test from "node:test";

import { parseCsv, validateDateRange } from "../src/csv.js";
import {
  alignmentScore,
  combineDailyData,
  dailyWind,
  initialBearing,
  linearRegression,
  windTravelBearing,
} from "../src/analysis.js";
import { fetchFirms, fetchWithRetry } from "../src/fetch_firms.js";

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
      { acq_date: "2019-09-01", region: "sumatra" },
      { acq_date: "2019-09-01", region: "sumatra" },
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
