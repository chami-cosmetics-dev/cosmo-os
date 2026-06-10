import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { PropsWithChildren } from "react";
import { useColorScheme } from "react-native";
import { loadThemeSetting, saveThemeSetting, type ThemeSetting } from "@/src/storage/theme";
import { darkColors, lightColors, radii, shadows, type ThemeColors } from "@/src/theme";

type ThemeContextValue = {
  colors: ThemeColors;
  themeSetting: ThemeSetting;
  resolvedMode: "light" | "dark";
  setThemeSetting: (setting: ThemeSetting) => Promise<void>;
  radii: typeof radii;
  shadows: typeof shadows;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: PropsWithChildren) {
  const systemScheme = useColorScheme();
  const [themeSetting, setThemeSettingState] = useState<ThemeSetting>("system");

  useEffect(() => {
    loadThemeSetting().then(setThemeSettingState);
  }, []);

  const resolvedMode: "light" | "dark" =
    themeSetting === "system" ? (systemScheme === "dark" ? "dark" : "light") : themeSetting;

  const colors = resolvedMode === "dark" ? darkColors : lightColors;

  const setThemeSetting = async (setting: ThemeSetting) => {
    setThemeSettingState(setting);
    await saveThemeSetting(setting);
  };

  const value = useMemo<ThemeContextValue>(
    () => ({
      colors,
      themeSetting,
      resolvedMode,
      setThemeSetting,
      radii,
      shadows,
    }),
    [colors, resolvedMode, themeSetting]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within ThemeProvider");
  }
  return context;
}
