import * as Location from 'expo-location';

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

export async function requestApproxLocation(): Promise<LocationResult> {
  let permission;
  try {
    permission = await Location.requestForegroundPermissionsAsync();
  } catch {
    return { status: 'unavailable', coords: null };
  }

  if (permission.status !== 'granted') {
    return { status: 'denied', coords: null };
  }

  try {
    const position = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });
    return {
      status: 'granted',
      coords: {
        lat: roundCoord(position.coords.latitude),
        lng: roundCoord(position.coords.longitude),
      },
    };
  } catch {
    return { status: 'unavailable', coords: null };
  }
}
