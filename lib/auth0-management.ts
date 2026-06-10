const AUTH0_DOMAIN = process.env.AUTH0_DOMAIN;
const AUTH0_CLIENT_ID = process.env.AUTH0_CLIENT_ID;
const AUTH0_CLIENT_SECRET = process.env.AUTH0_CLIENT_SECRET;
const AUTH0_M2M_CLIENT_ID = process.env.AUTH0_M2M_CLIENT_ID;
const AUTH0_M2M_CLIENT_SECRET = process.env.AUTH0_M2M_CLIENT_SECRET;
const AUTH0_DATABASE_CONNECTION = process.env.AUTH0_DATABASE_CONNECTION;

let cachedToken: { token: string; expiresAt: number } | null = null;

async function getManagementToken(): Promise<string> {
  if (
    !AUTH0_DOMAIN ||
    !AUTH0_M2M_CLIENT_ID ||
    !AUTH0_M2M_CLIENT_SECRET
  ) {
    throw new Error(
      "AUTH0_DOMAIN, AUTH0_M2M_CLIENT_ID, and AUTH0_M2M_CLIENT_SECRET must be set"
    );
  }

  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) {
    return cachedToken.token;
  }

  const response = await fetch(`https://${AUTH0_DOMAIN}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: AUTH0_M2M_CLIENT_ID,
      client_secret: AUTH0_M2M_CLIENT_SECRET,
      audience: `https://${AUTH0_DOMAIN}/api/v2/`,
      grant_type: "client_credentials",
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Failed to get Auth0 token: ${err}`);
  }

  const data = (await response.json()) as {
    access_token: string;
    expires_in: number;
  };

  cachedToken = {
    token: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };

  return data.access_token;
}

export type CreateUserParams = {
  email: string;
  password: string;
  givenName: string;
  familyName: string;
};

async function getAuth0UserByEmail(email: string, token: string): Promise<{ userId: string } | null> {
  if (!AUTH0_DOMAIN) return null;
  const q = encodeURIComponent(`email:"${email}"`);
  const res = await fetch(
    `https://${AUTH0_DOMAIN}/api/v2/users?q=${q}&search_engine=v3&per_page=1`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!res.ok) return null;
  const users = (await res.json()) as Array<{ user_id: string }>;
  return users[0] ? { userId: users[0].user_id } : null;
}

export async function createAuth0User(
  params: CreateUserParams
): Promise<{ userId: string }> {
  if (!AUTH0_DOMAIN || !AUTH0_DATABASE_CONNECTION) {
    throw new Error(
      "AUTH0_DOMAIN and AUTH0_DATABASE_CONNECTION must be set"
    );
  }

  const token = await getManagementToken();

  const response = await fetch(`https://${AUTH0_DOMAIN}/api/v2/users`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      connection: AUTH0_DATABASE_CONNECTION,
      email: params.email,
      password: params.password,
      given_name: params.givenName,
      family_name: params.familyName,
      name: `${params.givenName} ${params.familyName}`.trim(),
      email_verified: true,
    }),
  });

  if (!response.ok) {
    const err = (await response.json()) as { message?: string; code?: string; statusCode?: number };
    // Auth0 returns 409 when the user already exists — recover by fetching existing user_id
    if (response.status === 409 || err.message?.toLowerCase().includes("already exists")) {
      const existing = await getAuth0UserByEmail(params.email, token);
      if (existing) return existing;
    }
    throw new Error(err.message ?? `Auth0 create user failed: ${response.status}`);
  }

  const user = (await response.json()) as { user_id: string };
  return { userId: user.user_id };
}

type Auth0TokenError = {
  error?: string;
  error_description?: string;
};

export type VerifyAuth0PasswordResult =
  | { valid: true }
  | {
      valid: false;
      reason: "wrong_credentials" | "grant_not_enabled" | "misconfigured";
    };

async function requestAuth0PasswordToken(
  params: Record<string, string>
): Promise<{ ok: true } | { ok: false; error: Auth0TokenError }> {
  if (!AUTH0_DOMAIN) {
    return { ok: false, error: { error: "misconfigured" } };
  }

  const response = await fetch(`https://${AUTH0_DOMAIN}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params).toString(),
  });

  if (response.ok) {
    return { ok: true };
  }

  const error = (await response.json().catch(() => ({}))) as Auth0TokenError;
  return { ok: false, error };
}

/**
 * Verifies the user's current password using Resource Owner Password Grant.
 * Requires "Password" grant to be enabled for the Auth0 application.
 * Uses application/x-www-form-urlencoded per OAuth 2.0 RFC 6749.
 */
export async function verifyAuth0Password(
  email: string,
  password: string
): Promise<VerifyAuth0PasswordResult> {
  if (!AUTH0_DOMAIN || !AUTH0_CLIENT_ID || !AUTH0_CLIENT_SECRET) {
    return { valid: false, reason: "misconfigured" };
  }

  const username = email.trim().toLowerCase();
  const clientCredentials = {
    client_id: AUTH0_CLIENT_ID,
    client_secret: AUTH0_CLIENT_SECRET,
    scope: "openid",
  };

  // Try password-realm first if we have a database connection (targets specific connection).
  // Always fall through to the standard password grant on failure — wrong realm name
  // also returns invalid_grant, and web login may still work via Universal Login.
  if (AUTH0_DATABASE_CONNECTION) {
    const realmResult = await requestAuth0PasswordToken({
      grant_type: "http://auth0.com/oauth/grant-type/password-realm",
      username,
      password,
      ...clientCredentials,
      realm: AUTH0_DATABASE_CONNECTION,
    });

    if (realmResult.ok) {
      return { valid: true };
    }
  }

  // Fallback: standard password grant (uses default connection)
  const passwordResult = await requestAuth0PasswordToken({
    grant_type: "password",
    username,
    password,
    ...clientCredentials,
  });

  if (passwordResult.ok) {
    return { valid: true };
  }

  const passwordError = passwordResult.error.error ?? "";
  if (passwordError === "unauthorized_client" || passwordError === "unsupported_grant_type") {
    console.error("[auth0] Password grant is not enabled for AUTH0_CLIENT_ID");
    return { valid: false, reason: "grant_not_enabled" };
  }

  if (passwordError === "invalid_grant") {
    return { valid: false, reason: "wrong_credentials" };
  }

  console.error("[auth0] password verify failed:", passwordResult.error);
  return { valid: false, reason: "wrong_credentials" };
}

/**
 * Updates the user's password in Auth0.
 * Requires update:users permission for the M2M application.
 */
export async function updateAuth0Password(
  auth0Id: string,
  newPassword: string
): Promise<void> {
  if (!AUTH0_DOMAIN || !AUTH0_DATABASE_CONNECTION) {
    throw new Error(
      "AUTH0_DOMAIN and AUTH0_DATABASE_CONNECTION must be set"
    );
  }

  const token = await getManagementToken();

  const response = await fetch(
    `https://${AUTH0_DOMAIN}/api/v2/users/${encodeURIComponent(auth0Id)}`,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        password: newPassword,
        connection: AUTH0_DATABASE_CONNECTION,
      }),
    }
  );

  if (!response.ok) {
    const err = (await response.json()) as { message?: string; code?: string };
    throw new Error(
      err.message ?? `Auth0 password update failed: ${response.status}`
    );
  }
}

export async function deleteAuth0User(auth0Id: string): Promise<void> {
  if (!AUTH0_DOMAIN) {
    throw new Error("AUTH0_DOMAIN must be set");
  }

  const token = await getManagementToken();

  const response = await fetch(
    `https://${AUTH0_DOMAIN}/api/v2/users/${encodeURIComponent(auth0Id)}`,
    {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );

  if (!response.ok) {
    const err = (await response.json()) as { message?: string; code?: string };
    throw new Error(err.message ?? `Auth0 delete user failed: ${response.status}`);
  }
}
