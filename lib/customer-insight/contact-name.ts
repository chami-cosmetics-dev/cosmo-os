/** Honorifics blocked as a first name on Customer Insight profile. */
export const BLOCKED_FIRST_NAME_TITLES = [
  "mr",
  "mrs",
  "miss",
  "ms",
  "dr",
] as const;

export const CONTACT_FIRST_NAME_REQUIRED_ERROR = "First name is required";
export const CONTACT_LAST_NAME_REQUIRED_ERROR = "Last name is required";
export const CONTACT_FIRST_NAME_TITLE_ERROR =
  "First name cannot be a title like Mr, Mrs, or Miss";

function normalizeNameToken(value: string): string {
  return value.trim().toLowerCase().replace(/\.+$/g, "");
}

const blockedTitleSet = new Set<string>(BLOCKED_FIRST_NAME_TITLES);

export function isBlockedFirstNameTitle(value: string): boolean {
  const tokens = value.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return false;
  return blockedTitleSet.has(normalizeNameToken(tokens[0]!));
}

export function contactFirstNameError(firstName: string): string | null {
  if (!firstName.trim()) return CONTACT_FIRST_NAME_REQUIRED_ERROR;
  if (isBlockedFirstNameTitle(firstName)) return CONTACT_FIRST_NAME_TITLE_ERROR;
  return null;
}

export function splitContactName(fullName: string): {
  firstName: string;
  lastName: string;
} {
  const tokens = fullName.trim().split(/\s+/).filter(Boolean);
  while (tokens.length > 0 && isBlockedFirstNameTitle(tokens[0]!)) {
    tokens.shift();
  }
  if (tokens.length === 0) return { firstName: "", lastName: "" };
  if (tokens.length === 1) return { firstName: tokens[0]!, lastName: "" };
  return { firstName: tokens[0]!, lastName: tokens.slice(1).join(" ") };
}

export function joinContactName(firstName: string, lastName: string): string {
  return [firstName.trim(), lastName.trim()].filter(Boolean).join(" ");
}

export function isCompleteContactName(fullName: string): boolean {
  const parts = splitContactName(fullName);
  return Boolean(parts.firstName && parts.lastName);
}
