import { NextRequest, NextResponse } from "next/server";

import {
  verifyAuth0Password,
  updateAuth0Password,
} from "@/lib/auth0-management";
import { getCurrentUserContext } from "@/lib/rbac";
import { isPasswordStrong } from "@/lib/invite-utils";
import { passwordChangeSchema } from "@/lib/validation";

export async function POST(request: NextRequest) {
  const context = await getCurrentUserContext();
  if (!context?.sessionUser) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  if (!context.user) {
    return NextResponse.json(
      { error: "RBAC database is not initialized" },
      { status: 503 }
    );
  }

  const body = await request.json().catch(() => ({}));
  const parsed = passwordChangeSchema.safeParse(body);
  if (!parsed.success) {
    const msg = parsed.error.issues[0]?.message ?? "Invalid request";
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  const { currentPassword, newPassword } = parsed.data;

  const email = context.user.email;
  if (!email?.trim()) {
    return NextResponse.json(
      { error: "Email is required to change password" },
      { status: 400 }
    );
  }

  if (!isPasswordStrong(newPassword)) {
    return NextResponse.json(
      {
        error:
          "New password must be at least 8 characters with uppercase, lowercase, and a number",
      },
      { status: 400 }
    );
  }

  try {
    const isValid = await verifyAuth0Password(email, currentPassword);
    if (!isValid) {
      return NextResponse.json(
        { error: "Current password is incorrect" },
        { status: 400 }
      );
    }

    const auth0Id = context.sessionUser.sub;
    if (!auth0Id) {
      return NextResponse.json(
        { error: "Invalid session" },
        { status: 401 }
      );
    }
    await updateAuth0Password(auth0Id, newPassword);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Password change failed:", error);
    const message =
      error instanceof Error ? error.message : "Failed to change password";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
