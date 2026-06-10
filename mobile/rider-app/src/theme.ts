export type ThemeColors = {
  bg: string;
  surface: string;
  surfaceMuted: string;
  border: string;
  borderStrong: string;
  text: string;
  textMuted: string;
  textSoft: string;
  brand: string;
  brandSoft: string;
  accent: string;
  accentSoft: string;
  danger: string;
  dangerSoft: string;
  slate: string;
  slateSoft: string;
  white: string;
  /** Hero banner background (slate panel) */
  heroBg: string;
  /** Prices and strong emphasis on surface cards */
  emphasis: string;
  /** Text on accentSoft buttons inside hero panels */
  onAccentSoft: string;
  /** Special badge tints */
  badgeRearrangedBg: string;
  badgeRearrangedBorder: string;
  badgeExchangeBg: string;
  badgeExchangeBorder: string;
  badgeCollectionBg: string;
  badgeCollectionBorder: string;
};

export const lightColors: ThemeColors = {
  bg: "#f5f7fb",
  surface: "#ffffff",
  surfaceMuted: "#eef2f8",
  border: "#d9e0ec",
  borderStrong: "#c3cfdf",
  text: "#162338",
  textMuted: "#66758f",
  textSoft: "#8a97ad",
  brand: "#6f63d9",
  brandSoft: "rgba(111, 99, 217, 0.1)",
  accent: "#6bc8d6",
  accentSoft: "#e2f4f6",
  danger: "#c45b70",
  dangerSoft: "#fde8ee",
  slate: "#314768",
  slateSoft: "#e9eef5",
  white: "#ffffff",
  heroBg: "#314768",
  emphasis: "#314768",
  onAccentSoft: "#314768",
  badgeRearrangedBg: "#e0f2fe",
  badgeRearrangedBorder: "#bae6fd",
  badgeExchangeBg: "#ede9fe",
  badgeExchangeBorder: "#ddd6fe",
  badgeCollectionBg: "#fef3c7",
  badgeCollectionBorder: "#fde68a",
};

export const darkColors: ThemeColors = {
  bg: "#0d1728",
  surface: "#121f34",
  surfaceMuted: "#18263d",
  border: "rgba(143, 160, 191, 0.22)",
  borderStrong: "rgba(143, 160, 191, 0.36)",
  text: "#e8eef7",
  textMuted: "#9ba9bf",
  textSoft: "#7e8ea8",
  brand: "#9a8cf1",
  brandSoft: "rgba(154, 140, 241, 0.18)",
  accent: "#74c8d6",
  accentSoft: "rgba(116, 200, 214, 0.16)",
  danger: "#f08ca0",
  dangerSoft: "rgba(240, 140, 160, 0.14)",
  slate: "#243652",
  slateSoft: "#1a2740",
  white: "#ffffff",
  heroBg: "#1e3354",
  emphasis: "#e8eef7",
  onAccentSoft: "#e8eef7",
  badgeRearrangedBg: "rgba(116, 200, 214, 0.18)",
  badgeRearrangedBorder: "rgba(116, 200, 214, 0.45)",
  badgeExchangeBg: "rgba(154, 140, 241, 0.18)",
  badgeExchangeBorder: "rgba(154, 140, 241, 0.45)",
  badgeCollectionBg: "rgba(240, 140, 160, 0.14)",
  badgeCollectionBorder: "rgba(240, 140, 160, 0.35)",
};

export const colors = lightColors;

export const radii = {
  sm: 10,
  md: 14,
  lg: 18,
  pill: 999,
};

export const shadows = {
  card: {
    shadowColor: "#122033",
    shadowOpacity: 0.06,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
};
