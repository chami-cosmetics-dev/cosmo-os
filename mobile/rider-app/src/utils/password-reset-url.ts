/** Build Auth0 web login URL (Forgot password lives on Universal Login). */
export function buildPasswordResetUrl(base: string | null | undefined) {
  const trimmed = base?.trim();
  if (!trimmed) return null;
  return `${trimmed.replace(/\/$/, "")}/auth/login`;
}
