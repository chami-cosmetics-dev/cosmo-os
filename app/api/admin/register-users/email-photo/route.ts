import { put } from "@vercel/blob";
import { NextRequest, NextResponse } from "next/server";

import { requirePermission } from "@/lib/rbac";
import {
  getOrCreateRegisterSettings,
  upsertRegisterEmailTemplate,
} from "@/lib/register-users/settings";

const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

export async function POST(request: NextRequest) {
  const auth = await requirePermission("contacts.register");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const companyId = auth.context!.user?.companyId ?? null;
  if (!companyId) {
    return NextResponse.json(
      { error: "No company associated with your account" },
      { status: 404 },
    );
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }

  const file = formData.get("file");
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: "Photo is required" }, { status: 400 });
  }
  if (!ALLOWED.has(file.type)) {
    return NextResponse.json({ error: "Use a JPG, PNG, WEBP, or GIF photo" }, { status: 400 });
  }
  if (file.size > 8 * 1024 * 1024) {
    return NextResponse.json({ error: "Photo too large (max 8MB)" }, { status: 400 });
  }

  const blob = await put(`register-email/${companyId}/${file.name}`, file, {
    access: "public",
    addRandomSuffix: true,
  });

  const current = await getOrCreateRegisterSettings(companyId);
  const settings = await upsertRegisterEmailTemplate(companyId, {
    header: current.emailHeader,
    body: current.emailBody,
    photoUrl: blob.url,
  });

  return NextResponse.json({ photoUrl: settings.emailPhotoUrl });
}
