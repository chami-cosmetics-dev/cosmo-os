import AsyncStorage from "@react-native-async-storage/async-storage";

export type ThemeSetting = "system" | "light" | "dark";

const THEME_KEY = "cosmo-rider-theme";

export async function loadThemeSetting() {
  const raw = await AsyncStorage.getItem(THEME_KEY);
  if (raw === "light" || raw === "dark" || raw === "system") {
    return raw;
  }
  return "system" as ThemeSetting;
}

export async function saveThemeSetting(theme: ThemeSetting) {
  await AsyncStorage.setItem(THEME_KEY, theme);
}
