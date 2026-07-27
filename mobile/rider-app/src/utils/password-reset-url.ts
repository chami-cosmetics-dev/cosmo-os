/** Build Auth0 web login URL (Forgot password lives on Universal Login). */
export function buildPasswordResetUrl(base: unknown) {
  if (typeof base !== "string") return null;
  const trimmed = base.trim();
  if (!trimmed) return null;
  return `${trimmed.replace(/\/$/, "")}/auth/login`;
}
