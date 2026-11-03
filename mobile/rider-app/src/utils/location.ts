import * as Location from "expo-location";

export type RiderGpsFix = {
  latitude: number;
  longitude: number;
};

/**
 * GPS only for map directions (origin). Not stored on delivery complete.
 */
export async function captureMapOriginGps(): Promise<RiderGpsFix | null> {
  try {
    const permission = await Location.requestForegroundPermissionsAsync();
    if (!permission.granted) return null;

    const enabled = await Location.hasServicesEnabledAsync();
    if (!enabled) return null;

    const position = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
      mayShowUserSettingsDialog: true,
    });

    if (
      !Number.isFinite(position.coords.latitude) ||
      !Number.isFinite(position.coords.longitude)
    ) {
      return null;
    }

    return {
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
    };
  } catch {
    return null;
  }
}
