import assert from "node:assert/strict";
import test from "node:test";

import { parseCsv, validateDateRange } from "../src/csv.js";
import { alignmentScore, dailyWind, initialBearing, windTravelBearing } from "../src/analysis.js";

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
