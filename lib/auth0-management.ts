const AUTH0_DOMAIN = process.env.AUTH0_DOMAIN;
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
    const err = (await response.json()) as { message?: string; code?: string };
    throw new Error(err.message ?? `Auth0 create user failed: ${response.status}`);
  }

  const user = (await response.json()) as { user_id: string };
  return { userId: user.user_id };
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
