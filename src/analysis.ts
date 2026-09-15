export interface Coordinates {
  latitude: number;
  longitude: number;
}

export interface HourlyWind {
  date: string;
  wind_speed_kmh: number;
  wind_direction_degrees: number;
}

export interface DailyWind extends HourlyWind {
  observations: number;
}

export interface FireHotspot {
  acq_date: string;
  acq_time?: string;
  frp: number | string;
  region: keyof typeof SOURCE_CENTROIDS;
}

export interface Pm25Reading {
  date: string;
  pm25_ug_m3: number;
  coverage_percent?: number;
}

export interface CombinedDay extends DailyWind {
  hotspot_count: number;
  fire_radiative_power_mw: number;
  wind_alignment: number;
  aligned_hotspot_count: number;
  aligned_fire_radiative_power_mw: number;
  pm25_ug_m3: number | null;
  pm25_coverage_percent: number | null;
  pm25_next_day: number | null;
  pm25_next_day_coverage_percent: number | null;
  pm25_in_two_days: number | null;
  pm25_in_two_days_coverage_percent: number | null;
}

export interface RegressionResult {
  slope: number;
  intercept: number;
  r: number;
  rSquared: number;
  observations: number;
}

export const KUALA_LUMPUR: Coordinates = { latitude: 3.139, longitude: 101.6869 };
export const SOURCE_CENTROIDS = {
  sumatra: { latitude: 0, longitude: 101 },
  kalimantan: { latitude: 0.5, longitude: 113.5 },
} as const;

export function isUsablePm25(value: number | null, coveragePercent?: number | null): boolean {
  return value != null && coveragePercent != null && coveragePercent >= 75;
}

const radians = (degrees: number): number => degrees * Math.PI / 180;
const degrees = (angle: number): number => angle * 180 / Math.PI;
const normalise = (angle: number): number => (angle % 360 + 360) % 360;

export function initialBearing(
  fromLatitude: number,
  fromLongitude: number,
  toLatitude: number,
  toLongitude: number,
): number {
  const fromLat = radians(fromLatitude);
  const toLat = radians(toLatitude);
  const longitudeChange = radians(toLongitude - fromLongitude);
  const y = Math.sin(longitudeChange) * Math.cos(toLat);
  const x = Math.cos(fromLat) * Math.sin(toLat) -
    Math.sin(fromLat) * Math.cos(toLat) * Math.cos(longitudeChange);
  return normalise(degrees(Math.atan2(y, x)));
}

export function windTravelBearing(windFromDegrees: number): number {
  return normalise(windFromDegrees + 180);
}

export function alignmentScore(windFromDegrees: number, routeBearing: number): number {
  const difference = radians(windTravelBearing(windFromDegrees) - routeBearing);
  return Math.max(0, Math.cos(difference));
}

export function dailyWind(rows: HourlyWind[]): DailyWind[] {
  const byDate = new Map<string, HourlyWind[]>();
  for (const row of rows) byDate.set(row.date, [...(byDate.get(row.date) ?? []), row]);

  return [...byDate.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, hours]) => {
    const meanSpeed = hours.reduce((sum, hour) => sum + hour.wind_speed_kmh, 0) / hours.length;
    const x = hours.reduce((sum, hour) => sum + hour.wind_speed_kmh * Math.cos(radians(hour.wind_direction_degrees)), 0);
    const y = hours.reduce((sum, hour) => sum + hour.wind_speed_kmh * Math.sin(radians(hour.wind_direction_degrees)), 0);
    return {
      date,
      wind_speed_kmh: meanSpeed,
      wind_direction_degrees: normalise(degrees(Math.atan2(y, x))),
      observations: hours.length,
    };
  });
}

export function combineDailyData(
  hotspots: FireHotspot[],
  wind: DailyWind[],
  pm25: Pm25Reading[],
): CombinedDay[] {
  const pm25ByDate = new Map(pm25.map((row) => [row.date, row]));
  const firesByDate = new Map<string, FireHotspot[]>();
  for (const fire of hotspots) {
    const date = malaysiaFireDate(fire);
    firesByDate.set(date, [...(firesByDate.get(date) ?? []), fire]);
  }

  return wind.map((day) => {
    const fires = firesByDate.get(day.date) ?? [];
    const currentPm25 = pm25ByDate.get(day.date);
    const nextPm25 = pm25ByDate.get(addCalendarDays(day.date, 1));
    const twoDayPm25 = pm25ByDate.get(addCalendarDays(day.date, 2));
    let alignedHotspots = 0;
    let firePower = 0;
    let alignedFirePower = 0;
    for (const fire of fires) {
      const source = SOURCE_CENTROIDS[fire.region];
      if (!source) throw new Error(`Unknown fire region: ${fire.region}`);
      const route = initialBearing(source.latitude, source.longitude, KUALA_LUMPUR.latitude, KUALA_LUMPUR.longitude);
      const alignment = alignmentScore(day.wind_direction_degrees, route);
      const power = Number(fire.frp);
      if (!Number.isFinite(power) || power < 0) {
        throw new Error(`Missing or invalid FIRMS fire radiative power on ${fire.acq_date}.`);
      }
      alignedHotspots += alignment;
      firePower += power;
      alignedFirePower += power * alignment;
    }
    return {
      ...day,
      hotspot_count: fires.length,
      fire_radiative_power_mw: firePower,
      wind_alignment: fires.length === 0 ? 0 : alignedHotspots / fires.length,
      aligned_hotspot_count: alignedHotspots,
      aligned_fire_radiative_power_mw: alignedFirePower,
      pm25_ug_m3: currentPm25?.pm25_ug_m3 ?? null,
      pm25_coverage_percent: currentPm25?.coverage_percent ?? null,
      pm25_next_day: nextPm25?.pm25_ug_m3 ?? null,
      pm25_next_day_coverage_percent: nextPm25?.coverage_percent ?? null,
      pm25_in_two_days: twoDayPm25?.pm25_ug_m3 ?? null,
      pm25_in_two_days_coverage_percent: twoDayPm25?.coverage_percent ?? null,
    };
  });
}

export function malaysiaFireDate(fire: FireHotspot): string {
  if (fire.acq_time == null) return fire.acq_date;
  const time = fire.acq_time.padStart(4, "0");
  const hours = Number(time.slice(0, 2));
  const minutes = Number(time.slice(2));
  if (!/^\d{4}$/.test(time) || hours > 23 || minutes > 59) {
    throw new Error(`Invalid FIRMS acquisition time: ${fire.acq_time}`);
  }
  const utc = Date.parse(`${fire.acq_date}T${time.slice(0, 2)}:${time.slice(2)}:00Z`);
  if (!Number.isFinite(utc)) throw new Error(`Invalid FIRMS acquisition date: ${fire.acq_date}`);
  return new Date(utc + 8 * 60 * 60 * 1_000).toISOString().slice(0, 10);
}

function addCalendarDays(date: string, count: number): string {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + count);
  return value.toISOString().slice(0, 10);
}

export function linearRegression(points: Array<{ x: number; y: number }>): RegressionResult {
  if (points.length < 2) throw new Error("Regression needs at least two complete observations.");
  const meanX = points.reduce((sum, point) => sum + point.x, 0) / points.length;
  const meanY = points.reduce((sum, point) => sum + point.y, 0) / points.length;
  const covariance = points.reduce((sum, point) => sum + (point.x - meanX) * (point.y - meanY), 0);
  const varianceX = points.reduce((sum, point) => sum + (point.x - meanX) ** 2, 0);
  const varianceY = points.reduce((sum, point) => sum + (point.y - meanY) ** 2, 0);
  if (varianceX === 0 || varianceY === 0) throw new Error("Regression needs variation in both variables.");

  const slope = covariance / varianceX;
  const r = covariance / Math.sqrt(varianceX * varianceY);
  return {
    slope,
    intercept: meanY - slope * meanX,
    r,
    rSquared: r ** 2,
    observations: points.length,
  };
}

export function meanAbsoluteError(points: Array<{ predicted: number; actual: number }>): number {
  if (points.length === 0) throw new Error("Mean absolute error needs at least one prediction.");
  return points.reduce((sum, point) => sum + Math.abs(point.predicted - point.actual), 0) / points.length;
}

export function scatterSvg(
  points: Array<{ x: number; y: number }>,
  regression: RegressionResult,
): string {
  if (points.length === 0) throw new Error("The scatter plot needs at least one point.");
  const width = 760;
  const height = 460;
  const margin = 60;
  const xValues = points.map((point) => point.x);
  const yValues = points.map((point) => point.y);
  const xMin = Math.min(...xValues);
  const xMax = Math.max(...xValues);
  const lineY = [regression.intercept + regression.slope * xMin, regression.intercept + regression.slope * xMax];
  const yMin = Math.min(...yValues, ...lineY);
  const yMax = Math.max(...yValues, ...lineY);
  const scaleX = (value: number): number => margin + (value - xMin) / (xMax - xMin) * (width - margin * 2);
  const scaleY = (value: number): number => height - margin - (value - yMin) / (yMax - yMin) * (height - margin * 2);
  const circles = points.map((point) =>
    `<circle cx="${scaleX(point.x).toFixed(1)}" cy="${scaleY(point.y).toFixed(1)}" r="4" fill="#d95f02" fill-opacity="0.75"/>`
  ).join("\n  ");

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="title description">
  <title id="title">Aligned fire hotspots and next-day PM2.5</title>
  <desc id="description">Scatter plot with an ordinary least-squares regression line.</desc>
  <rect width="100%" height="100%" fill="white"/>
  <line x1="${margin}" y1="${height - margin}" x2="${width - margin}" y2="${height - margin}" stroke="#333"/>
  <line x1="${margin}" y1="${margin}" x2="${margin}" y2="${height - margin}" stroke="#333"/>
  <line x1="${scaleX(xMin)}" y1="${scaleY(lineY[0] ?? 0)}" x2="${scaleX(xMax)}" y2="${scaleY(lineY[1] ?? 0)}" stroke="#1b9e77" stroke-width="3"/>
  ${circles}
  <text x="${width / 2}" y="${height - 15}" text-anchor="middle" font-family="sans-serif" font-size="14">Wind-aligned hotspot count</text>
  <text x="18" y="${height / 2}" text-anchor="middle" transform="rotate(-90 18 ${height / 2})" font-family="sans-serif" font-size="14">Next-day PM2.5 (µg/m³)</text>
  <text x="${width - margin}" y="${margin - 20}" text-anchor="end" font-family="sans-serif" font-size="13">r = ${regression.r.toFixed(3)}; R² = ${regression.rSquared.toFixed(3)}</text>
</svg>\n`;
}
