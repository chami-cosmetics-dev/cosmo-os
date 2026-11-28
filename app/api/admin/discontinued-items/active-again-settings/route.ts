import { NextRequest, NextResponse } from "next/server";

import { describeSchedule, parseActiveAgainSchedule } from "@/lib/discontinued-items/active-again";
import { ACTIVE_AGAIN_MAIL_TEMPLATE } from "@/lib/discontinued-items/active-again-mail-template";
import {
  getActiveAgainSetting,
  saveActiveAgainSchedule,
} from "@/lib/discontinued-items/active-again.server";
import { DISCONTINUED_ITEMS_PERMISSIONS } from "@/lib/discontinued-items/config";
import { hasPermission, requireUserContext } from "@/lib/rbac";

export const dynamic = "force-dynamic";

async function authorize() {
  const auth = await requireUserContext();
  if (!auth.ok) return { error: NextResponse.json({ error: auth.error }, { status: auth.status }) };
  if (!hasPermission(auth.context, DISCONTINUED_ITEMS_PERMISSIONS.manager)) {
    return { error: NextResponse.json({ error: "Permission denied" }, { status: 403 }) };
  }
  return { auth };
}

async function payload() {
  const setting = await getActiveAgainSetting();
  return {
    weekday: setting.weekday,
    time: setting.time,
    label: describeSchedule(setting),
    lastRunWeek: setting.lastRunWeek,
    updatedBy: setting.updatedBy,
    updatedAt: setting.updatedAt,
    templateName: ACTIVE_AGAIN_MAIL_TEMPLATE.name,
  };
}

/** Weekly "active again" mail: day / time (Manager). Recipients are on the Email Template. */
export async function GET() {
  const { error } = await authorize();
  if (error) return error;
  return NextResponse.json(await payload());
}

export async function PUT(request: NextRequest) {
  const { auth, error } = await authorize();
  if (error) return error;
  const body = (await request.json().catch(() => null)) as { weekday?: unknown; time?: unknown } | null;
  const schedule = parseActiveAgainSchedule(body);
  if (schedule.weekday !== body?.weekday || schedule.time !== body?.time) {
    return NextResponse.json({ error: "Pick a day and a time (HH:MM)." }, { status: 400 });
  }
  await saveActiveAgainSchedule(schedule, auth.user.name?.trim() || auth.user.email || "Unknown user");
  return NextResponse.json(await payload());
}
