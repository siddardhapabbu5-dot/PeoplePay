import * as Location from "expo-location";
import { Linking } from "react-native";

export async function requestGps() {
  const current = await Location.getForegroundPermissionsAsync();
  if (current.status !== "granted") {
    const asked = await Location.requestForegroundPermissionsAsync();
    if (asked.status !== "granted") {
      return { ok: false as const, error: "Location permission is required for attendance." };
    }
  }
  const enabled = await Location.hasServicesEnabledAsync();
  if (!enabled) return { ok: false as const, error: "Please enable location services." };
  const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Highest });
  if (pos.coords.accuracy && pos.coords.accuracy > 80) {
    return { ok: false as const, error: "GPS accuracy is insufficient. Please move to an open area and try again." };
  }
  return {
    ok: true as const,
    latitude: pos.coords.latitude,
    longitude: pos.coords.longitude,
    gpsAccuracy: pos.coords.accuracy ?? undefined,
    mockGps: Boolean((pos as any).mocked),
  };
}

export function openSettings() {
  Linking.openSettings();
}
