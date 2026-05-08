import * as SecureStore from "expo-secure-store";

const SESSION_KEY = "cosmo-rider-session";

export type RiderSession = {
  accessToken: string;
  expiresAt: string;
  rider: {
    id: string;
    name: string | null;
    email: string | null;
    mobile: string | null;
    company?: {
      id: string;
      name: string;
    } | null;
  };
};

export async function saveSession(session: RiderSession) {
  await SecureStore.setItemAsync(SESSION_KEY, JSON.stringify(session));
}

export async function loadSession() {
  const raw = await SecureStore.getItemAsync(SESSION_KEY);
  return raw ? (JSON.parse(raw) as RiderSession) : null;
}

export async function clearSession() {
  await SecureStore.deleteItemAsync(SESSION_KEY);
}
