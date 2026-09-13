import assert from "node:assert/strict";
import test from "node:test";

import { parseCsv, validateDateRange } from "../src/csv.js";

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
