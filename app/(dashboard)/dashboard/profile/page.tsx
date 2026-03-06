import { redirect } from "next/navigation";
import { BadgeCheck, KeyRound, ShieldCheck, UserCircle2 } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ProfileForm } from "@/components/molecules/profile-form";
import { PasswordChangeModal } from "@/components/molecules/password-change-modal";
import { getCurrentUserContext } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const context = await getCurrentUserContext();
  if (!context?.sessionUser) {
    redirect("/login");
  }
  if (!context.user) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Profile</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-sm">
            Unable to load profile. RBAC database may not be initialized.
          </p>
        </CardContent>
      </Card>
    );
  }

  const { user } = context;
  const employeeProfile = await prisma.employeeProfile.findFirst({
    where: { userId: user.id },
    include: {
      location: { select: { id: true, name: true } },
      department: { select: { id: true, name: true } },
      designation: { select: { id: true, name: true } },
    },
  });

  const profileData = {
    id: user.id,
    name: user.name,
    email: user.email,
    picture: user.picture,
    profilePhotoUrl: user.profilePhotoUrl ?? null,
    nicNo: user.nicNo,
    gender: user.gender,
    dateOfBirth: user.dateOfBirth,
    mobile: user.mobile,
    knownName: user.knownName,
    roles: user.userRoles.map((ur) => ur.role),
    employeeProfile: employeeProfile
      ? {
          employeeNumber: employeeProfile.employeeNumber,
          epfNumber: employeeProfile.epfNumber,
          location: employeeProfile.location,
          department: employeeProfile.department,
          designation: employeeProfile.designation,
          appointmentDate: employeeProfile.appointmentDate,
        }
      : null,
  };

  return (
    <div className="space-y-6">
      <Card className="border-border/70 bg-card/95 shadow-sm">
        <CardContent className="pt-6">
          <div className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)]">
            <div className="space-y-5">
              <div className="space-y-2">
                <div className="inline-flex items-center gap-2 rounded-full bg-sky-100 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-sky-800 dark:bg-sky-900/30 dark:text-sky-300">
                  <UserCircle2 className="size-3.5" aria-hidden />
                  Profile Settings
                </div>
                <div>
                  <h1 className="text-2xl font-semibold tracking-tight">My Profile</h1>
                  <p className="text-sm text-muted-foreground">
                    Keep your personal details up to date. Organization-managed
                    employment details are shown below for reference.
                  </p>
                </div>
              </div>
              <ProfileForm initialData={profileData} />
            </div>

            <div className="space-y-4">
              <Card className="border-border/70 bg-background/80 shadow-none">
                <CardHeader className="space-y-2">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <ShieldCheck className="size-4 text-sky-700" aria-hidden />
                    Account Security
                  </CardTitle>
                  <p className="text-sm text-muted-foreground">
                    Update your sign-in password anytime. Use a strong password that
                    is unique to this account.
                  </p>
                </CardHeader>
                <CardContent>
                  <PasswordChangeModal />
                </CardContent>
              </Card>

              <Card className="border-border/70 bg-background/80 shadow-none">
                <CardHeader className="space-y-2">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <BadgeCheck className="size-4 text-sky-700" aria-hidden />
                    Quick Summary
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="rounded-lg border bg-muted/30 p-4">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Signed in as
                    </p>
                    <p className="mt-1 font-medium">{profileData.email ?? "No email"}</p>
                  </div>
                  <div className="rounded-lg border bg-muted/30 p-4">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Roles
                    </p>
                    <p className="mt-1 text-sm">
                      {profileData.roles.length > 0
                        ? profileData.roles.map((role) => role.name).join(", ")
                        : "No roles assigned"}
                    </p>
                  </div>
                  <div className="flex items-start gap-3 rounded-lg border bg-muted/30 p-4">
                    <KeyRound className="mt-0.5 size-4 text-muted-foreground" aria-hidden />
                    <p className="text-sm text-muted-foreground">
                      If you change your password, use the new password the next time
                      you sign in.
                    </p>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
