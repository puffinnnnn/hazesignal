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

export const KUALA_LUMPUR: Coordinates = { latitude: 3.139, longitude: 101.6869 };
export const SOURCE_CENTROIDS = {
  sumatra: { latitude: 0, longitude: 101 },
  kalimantan: { latitude: 0.5, longitude: 113.5 },
} as const;

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
