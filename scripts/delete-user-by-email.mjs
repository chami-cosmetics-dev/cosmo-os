/**
 * Delete a Cosmo/Vault user by email from DB (+ Auth0 when M2M credentials exist).
 *
 *   node scripts/with-env.mjs cosmo-prod node scripts/delete-user-by-email.mjs imandi@example.com
 *
 * Pass --dry-run to only print what would be deleted.
 */
import { PrismaClient } from "@prisma/client";

const email = (process.argv[2] ?? "").trim().toLowerCase();
const dryRun = process.argv.includes("--dry-run");

if (!email || email.startsWith("--")) {
  console.error(
    "Usage: node scripts/delete-user-by-email.mjs email@example.com [--dry-run]",
  );
  process.exit(1);
}

const prisma = new PrismaClient();

async function getAuth0ManagementToken() {
  const domain = process.env.AUTH0_DOMAIN;
  const clientId = process.env.AUTH0_M2M_CLIENT_ID;
  const clientSecret = process.env.AUTH0_M2M_CLIENT_SECRET;
  if (!domain || !clientId || !clientSecret) {
    return null;
  }
  const res = await fetch(`https://${domain}/oauth/token`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      audience: `https://${domain}/api/v2/`,
      grant_type: "client_credentials",
    }),
  });
  if (!res.ok) {
    throw new Error(`Auth0 token failed: ${res.status} ${await res.text()}`);
  }
  const data = await res.json();
  return { domain, token: data.access_token };
}

async function deleteAuth0User(auth0Id, email) {
  const auth = await getAuth0ManagementToken();
  if (!auth) {
    console.warn("Auth0 M2M credentials missing — skipping Auth0 delete");
    return { skipped: true };
  }

  // Verify user exists / resolve id by email if needed
  let targetId = auth0Id;
  const getRes = await fetch(
    `https://${auth.domain}/api/v2/users/${encodeURIComponent(auth0Id)}`,
    { headers: { authorization: `Bearer ${auth.token}` } },
  );
  if (getRes.status === 404 && email) {
    const q = encodeURIComponent(`email:"${email}"`);
    const searchRes = await fetch(
      `https://${auth.domain}/api/v2/users?q=${q}&search_engine=v3&per_page=5`,
      { headers: { authorization: `Bearer ${auth.token}` } },
    );
    if (searchRes.ok) {
      const users = await searchRes.json();
      if (Array.isArray(users) && users[0]?.user_id) {
        targetId = users[0].user_id;
      } else {
        return { missing: true };
      }
    }
  } else if (!getRes.ok && getRes.status !== 404) {
    const body = await getRes.text();
    throw new Error(`Auth0 get user failed: ${getRes.status} ${body}`);
  }

  const res = await fetch(
    `https://${auth.domain}/api/v2/users/${encodeURIComponent(targetId)}`,
    {
      method: "DELETE",
      headers: { authorization: `Bearer ${auth.token}` },
    },
  );
  if (res.status === 404) {
    return { missing: true, auth0Id: targetId };
  }
  if (!res.ok) {
    const body = await res.text();
    // Allow DB cleanup to proceed — operator can clean Auth0 manually if needed
    console.warn(`Auth0 delete failed (${res.status}): ${body}`);
    return { failed: true, status: res.status, auth0Id: targetId, body };
  }
  return { deleted: true, auth0Id: targetId };
}

const user = await prisma.user.findUnique({
  where: { email },
  select: {
    id: true,
    email: true,
    name: true,
    auth0Id: true,
    companyId: true,
    userRoles: { select: { role: { select: { name: true } } } },
  },
});

if (!user) {
  console.log(JSON.stringify({ ok: false, error: "User not found", email }));
  await prisma.$disconnect();
  process.exit(1);
}

const roles = user.userRoles.map((ur) => ur.role.name);
if (roles.includes("super_admin")) {
  console.error("Refusing to delete super_admin");
  await prisma.$disconnect();
  process.exit(1);
}

const inviteCount = await prisma.invite.count({ where: { email } });

console.log(
  JSON.stringify(
    {
      dryRun,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        auth0Id: user.auth0Id,
        companyId: user.companyId,
        roles,
      },
      invitesForEmail: inviteCount,
    },
    null,
    2,
  ),
);

if (dryRun) {
  await prisma.$disconnect();
  process.exit(0);
}

const auth0Result = await deleteAuth0User(user.auth0Id, email);

await prisma.$transaction(async (tx) => {
  await tx.userRole.deleteMany({ where: { userId: user.id } });
  await tx.userFinanceScope.deleteMany({ where: { userId: user.id } });
  await tx.riderMobileSession.deleteMany({ where: { userId: user.id } }).catch(() => {});
  await tx.notification.deleteMany({ where: { userId: user.id } }).catch(() => {});
  await tx.invite.updateMany({
    where: { invitedById: user.id },
    data: { invitedById: null },
  });
  await tx.invite.deleteMany({ where: { email } });
  await tx.employeeProfile.deleteMany({ where: { userId: user.id } }).catch(() => {});
  await tx.user.delete({ where: { id: user.id } });
});

console.log(
  JSON.stringify({
    ok: true,
    deletedUserId: user.id,
    deletedEmail: email,
    auth0: auth0Result,
  }),
);

await prisma.$disconnect();
