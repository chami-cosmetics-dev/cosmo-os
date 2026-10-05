import { NextResponse } from "next/server";

import { getCurrentUserContext, requireAnyPermission } from "@/lib/rbac";

type UserContext = NonNullable<Awaited<ReturnType<typeof getCurrentUserContext>>>;

export async function runItemCreationAction(
  params: Promise<{ id: string }>,
  permissions: string[],
  action: (context: UserContext, id: string, body: unknown) => Promise<unknown>,
  request?: Request
) {
  const auth = await requireAnyPermission(permissions);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const { id } = await params;
    const body = request ? await request.json().catch(() => ({})) : {};
    await action(auth.context!, id, body);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Request failed";
    return NextResponse.json(
      { error: message },
      { status: message === "Permission denied" ? 403 : 400 }
    );
  }
}
