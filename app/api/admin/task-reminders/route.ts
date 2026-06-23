import { NextResponse } from "next/server";

import { fetchTaskReminders } from "@/lib/task-reminders";
import { getCurrentUserContext } from "@/lib/rbac";

export const dynamic = "force-dynamic";

export async function GET() {
  const context = await getCurrentUserContext();
  const companyId = context?.user?.companyId;
  if (!context?.user?.id || !companyId) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const result = await fetchTaskReminders(companyId, {
    permissionKeys: (context.permissionKeys ?? []) as string[],
    roleNames: (context.roleNames ?? []) as string[],
  });

  return NextResponse.json(result);
}
