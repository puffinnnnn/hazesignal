import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import { parse } from "csv-parse/sync";
import { stringify } from "csv-stringify/sync";

export type CsvValue = string | number | boolean | null | undefined;
export type CsvRow = Record<string, CsvValue>;

export function parseCsv<T>(text: string): T[] {
  return parse(text, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  }) as T[];
}

export async function readCsv<T>(path: string): Promise<T[]> {
  return parseCsv<T>(await readFile(path, "utf8"));
}

export async function writeCsv(path: string, rows: CsvRow[]): Promise<void> {
  if (rows.length === 0) throw new Error(`Refusing to write an empty CSV: ${path}`);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, stringify(rows, { header: true }), "utf8");
}

export function validateDateRange(start: string, end: string): void {
  const pattern = /^\d{4}-\d{2}-\d{2}$/;
  if (!pattern.test(start) || !pattern.test(end)) {
    throw new Error("Dates must use YYYY-MM-DD format.");
  }

  const startTime = Date.parse(`${start}T00:00:00Z`);
  const endTime = Date.parse(`${end}T00:00:00Z`);
  if (!Number.isFinite(startTime) || !Number.isFinite(endTime)) {
    throw new Error("Dates must be real calendar dates.");
  }
  if (new Date(startTime).toISOString().slice(0, 10) !== start ||
      new Date(endTime).toISOString().slice(0, 10) !== end) {
    throw new Error("Dates must be real calendar dates.");
  }
  if (endTime < startTime) throw new Error("End date must be on or after start date.");
}

export function addDays(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

export function daysInclusive(start: string, end: string): number {
  return Math.round((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86_400_000) + 1;
}

