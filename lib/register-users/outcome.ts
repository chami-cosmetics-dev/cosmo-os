export type RegisterOutcome = "created" | "already_registered" | "updated";

export type RegisterProfileFields = {
  name: string | null | undefined;
  email: string | null | undefined;
  birthYear?: number | null;
  birthMonth?: number | null;
  birthDay?: number | null;
};

export function normalizeRegisterEmail(
  email: string | null | undefined,
): string | null {
  const t = email?.trim().toLowerCase() ?? "";
  return t || null;
}

export function normalizeRegisterName(name: string | null | undefined): string {
  return name?.trim() ?? "";
}

export function profileFieldsChanged(
  before: RegisterProfileFields,
  after: RegisterProfileFields,
  compareBirthday = true,
): boolean {
  if (normalizeRegisterName(before.name) !== normalizeRegisterName(after.name)) {
    return true;
  }
  if (normalizeRegisterEmail(before.email) !== normalizeRegisterEmail(after.email)) {
    return true;
  }
  if (!compareBirthday) return false;
  return (
    (before.birthYear ?? null) !== (after.birthYear ?? null) ||
    (before.birthMonth ?? null) !== (after.birthMonth ?? null) ||
    (before.birthDay ?? null) !== (after.birthDay ?? null)
  );
}

export function outcomeForExisting(
  changed: boolean,
): Exclude<RegisterOutcome, "created"> {
  return changed ? "updated" : "already_registered";
}
