/** Default Cosmetics.lk storefront for birthday SMS. */
export const BIRTHDAY_WISH_STORE_URL = "https://cosmetics.lk";

const BIRTHDAY_GREETINGS = [
  "Happy Birthday {{name}}! Warm wishes from cosmetics.lk — wishing you a beautiful day filled with glow and joy.",
  "Happy Birthday {{name}}! cosmetics.lk wishes you a radiant year ahead.",
  "Happy Birthday {{name}}! Celebrating you today with love from cosmetics.lk.",
  "Happy Birthday {{name}}! Warm birthday wishes from cosmetics.lk for health, happiness, and great skin days ahead.",
];

/** Pure client-safe birthday SMS message builder (no server imports). */
export function buildBirthdayWishMessage(input: {
  customerName: string;
  merchantName: string;
  discountPercent: number;
  code?: string | null;
  storeUrl?: string | null;
}): string {
  const greeting =
    BIRTHDAY_GREETINGS[Math.floor(Math.random() * BIRTHDAY_GREETINGS.length)] ??
    BIRTHDAY_GREETINGS[0];
  const name = input.customerName.trim() || "friend";
  const storeUrl = (input.storeUrl ?? BIRTHDAY_WISH_STORE_URL).trim() || BIRTHDAY_WISH_STORE_URL;
  const merchant = input.merchantName.trim();

  let message = greeting.replace(/\{\{name\}\}/g, name);
  if (merchant) {
    message += ` — from your cosmetics.lk advisor ${merchant}.`;
  }
  if (input.discountPercent > 0) {
    message += ` Enjoy ${input.discountPercent}% off`;
    if (input.code?.trim()) message += ` with code ${input.code.trim()}`;
    message += " on your next purchase.";
  }
  message += ` Shop now: ${storeUrl}`;
  message += " [BDWISH]";
  return message;
}
