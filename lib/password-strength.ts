/**
 * Client-safe password strength utilities.
 * Must match server-side isPasswordStrong in invite-utils.ts.
 */

export const PASSWORD_REQUIREMENTS = {
  minLength: 8,
  maxLength: 128,
} as const;

export type PasswordRequirement = {
  key: string;
  label: string;
  met: boolean;
};

export function getPasswordRequirements(password: string): PasswordRequirement[] {
  return [
    {
      key: "length",
      label: `At least ${PASSWORD_REQUIREMENTS.minLength} characters`,
      met: password.length >= PASSWORD_REQUIREMENTS.minLength,
    },
    {
      key: "uppercase",
      label: "One uppercase letter",
      met: /[A-Z]/.test(password),
    },
    {
      key: "lowercase",
      label: "One lowercase letter",
      met: /[a-z]/.test(password),
    },
    {
      key: "number",
      label: "One number",
      met: /\d/.test(password),
    },
    {
      key: "special",
      label: "One special character (recommended)",
      met: /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(password),
    },
  ];
}

export function isPasswordStrong(password: string): boolean {
  const reqs = getPasswordRequirements(password);
  return (
    reqs[0].met && reqs[1].met && reqs[2].met && reqs[3].met
  );
}

/** Returns 0-4 for strength bar. All 4 required + optional special = 4. */
export function getPasswordStrengthScore(password: string): number {
  if (!password) return 0;
  const reqs = getPasswordRequirements(password);
  const requiredMet = [reqs[0], reqs[1], reqs[2], reqs[3]].filter((r) => r.met)
    .length;
  if (requiredMet < 4) return requiredMet;
  return reqs[4].met ? 4 : 3;
}
