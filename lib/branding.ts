export const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME?.trim() || "Cosmo OS";

export const APP_INITIALS =
  process.env.NEXT_PUBLIC_APP_INITIALS?.trim() ||
  APP_NAME.split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") ||
  "CO";
