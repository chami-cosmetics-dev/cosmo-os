const BIRTHDAY_GREETINGS = [
  "Happy Birthday {{name}}! Wishing you a beautiful day filled with glow and joy.",
  "Happy Birthday {{name}}! May your year ahead be as radiant as you are.",
  "Happy Birthday {{name}}! Celebrating you today — enjoy every moment.",
  "Happy Birthday {{name}}! Sending warm wishes for health, happiness, and great skin days ahead.",
];

/** Pure client-safe birthday WhatsApp message builder (no server imports). */
export function buildBirthdayWishMessage(input: {
  customerName: string;
  merchantName: string;
  discountPercent: number;
  code?: string | null;
}): string {
  const greeting =
    BIRTHDAY_GREETINGS[Math.floor(Math.random() * BIRTHDAY_GREETINGS.length)] ??
    BIRTHDAY_GREETINGS[0];
  const name = input.customerName.trim() || "friend";
  let message = greeting.replace(/\{\{name\}\}/g, name);
  message += ` From ${input.merchantName.trim() || "Cosmo"}.`;
  if (input.discountPercent > 0) {
    message += ` Enjoy ${input.discountPercent}% off`;
    if (input.code?.trim()) message += ` with code ${input.code.trim()}`;
    message += " on your next Cosmo purchase.";
  }
  message += " [BDWISH]";
  return message;
}
