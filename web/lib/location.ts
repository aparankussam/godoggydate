// web/lib/location.ts
// Browser equivalent of mobile/lib/location.ts.
// Wraps the standard navigator.geolocation API and returns coords rounded
// to ~1.1 km precision (matches the mobile rounding in PUBLIC_COORD_DECIMALS),
// so the public dog doc never carries an exact address.

export type LocationStatus = 'granted' | 'denied' | 'unavailable';

export interface ApproxCoords {
  lat: number;
  lng: number;
}

export interface LocationResult {
  status: LocationStatus;
  coords: ApproxCoords | null;
}

const COORD_DECIMALS = 2;

function roundCoord(value: number): number {
  const factor = 10 ** COORD_DECIMALS;
  return Math.round(value * factor) / factor;
}

export function requestApproxLocation(): Promise<LocationResult> {
  if (typeof window === 'undefined' || !navigator.geolocation) {
    return Promise.resolve({ status: 'unavailable', coords: null });
  }

  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          status: 'granted',
          coords: {
            lat: roundCoord(position.coords.latitude),
            lng: roundCoord(position.coords.longitude),
          },
        });
      },
      (error) => {
        if (error && error.code === error.PERMISSION_DENIED) {
          resolve({ status: 'denied', coords: null });
        } else {
          resolve({ status: 'unavailable', coords: null });
        }
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 0 },
    );
  });
}
