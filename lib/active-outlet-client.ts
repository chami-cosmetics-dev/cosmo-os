/** sessionStorage key — cleared on logout so next login re-asks. */
export const ACTIVE_OUTLET_SESSION_KEY = "cosmo-active-outlet-session";

export function clearActiveOutletSession() {
  try {
    sessionStorage.removeItem(ACTIVE_OUTLET_SESSION_KEY);
  } catch {
    /* ignore */
  }
}

export function requestOutletSwitch() {
  window.dispatchEvent(new Event("cosmo:switch-outlet"));
}
