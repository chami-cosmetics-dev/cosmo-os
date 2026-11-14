/**
 * Finance staff identity: role `finance`, `hod`, or names containing "finance".
 */

export function isFinanceRoleName(name: string | null | undefined): boolean {
  const trimmed = (name ?? "").trim().toLowerCase();
  if (!trimmed) return false;
  return trimmed === "finance" || trimmed === "hod" || trimmed.includes("finance");
}

export function userHasFinanceRole(roleNames: string[] | null | undefined): boolean {
  return (roleNames ?? []).some((name) => isFinanceRoleName(name));
}
