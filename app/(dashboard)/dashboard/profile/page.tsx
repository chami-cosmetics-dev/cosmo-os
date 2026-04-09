import { redirect } from "next/navigation";
import { ShieldCheck, UserRound } from "lucide-react";

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
      <Card className="overflow-hidden border-border/70 shadow-xs">
        <CardHeader className="border-b border-border/50 bg-[linear-gradient(180deg,color-mix(in_srgb,var(--background)_92%,white),color-mix(in_srgb,var(--secondary)_12%,transparent),color-mix(in_srgb,var(--primary)_8%,transparent))]">
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
  const [employeeProfile, userAccess] = await Promise.all([
    prisma.employeeProfile.findFirst({
      where: { userId: user.id },
      include: {
        location: { select: { id: true, name: true } },
        department: { select: { id: true, name: true } },
        designation: { select: { id: true, name: true } },
      },
    }),
    prisma.user.findUnique({
      where: { id: user.id },
      select: { userRoles: { select: { role: true } } },
    }),
  ]);

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
    roles: userAccess?.userRoles.map((ur) => ur.role) ?? [],
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
      <section className="relative overflow-hidden rounded-2xl border border-border/70 bg-[linear-gradient(135deg,var(--dashboard-hero-start),var(--dashboard-hero-middle),var(--dashboard-hero-end))] p-5 shadow-[0_18px_40px_-28px_var(--primary)] sm:p-6">
        <div className="pointer-events-none absolute inset-y-0 right-0 w-1/3 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.4),transparent_65%)] dark:bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.1),transparent_65%)]" />
        <p className="text-muted-foreground text-xs font-semibold tracking-[0.18em] uppercase">
          Account
        </p>
        <h1 className="mt-1 flex items-center gap-2 text-2xl font-semibold tracking-tight sm:text-3xl">
          <UserRound className="size-5 text-muted-foreground" />
          My Profile
        </h1>
        <p className="text-muted-foreground mt-2 max-w-3xl text-sm sm:text-base">
          Review your personal information, update contact details, and keep your account profile current.
        </p>
      </section>

      <div className="grid gap-3 md:grid-cols-3">
        <div className="rounded-2xl border border-border/70 bg-[linear-gradient(135deg,color-mix(in_srgb,var(--background)_95%,white),color-mix(in_srgb,var(--secondary)_8%,transparent))] p-4 shadow-xs">
          <p className="text-muted-foreground text-[11px] font-semibold tracking-[0.18em] uppercase">Account Email</p>
          <p className="mt-2 text-sm font-semibold">{profileData.email ?? "-"}</p>
          <p className="text-muted-foreground mt-1 text-xs">Your sign-in email and primary account identity.</p>
        </div>
        <div className="rounded-2xl border border-border/70 bg-[linear-gradient(135deg,color-mix(in_srgb,var(--background)_95%,white),color-mix(in_srgb,var(--primary)_8%,transparent))] p-4 shadow-xs">
          <p className="text-muted-foreground text-[11px] font-semibold tracking-[0.18em] uppercase">Roles</p>
          <p className="mt-2 text-sm font-semibold">{profileData.roles.length > 0 ? profileData.roles.length : 0}</p>
          <p className="text-muted-foreground mt-1 text-xs">Access roles assigned to your account by the organization.</p>
        </div>
        <div className="rounded-2xl border border-border/70 bg-[linear-gradient(135deg,color-mix(in_srgb,var(--background)_95%,white),color-mix(in_srgb,var(--secondary)_10%,transparent),color-mix(in_srgb,var(--primary)_6%,transparent))] p-4 shadow-xs">
          <p className="text-muted-foreground text-[11px] font-semibold tracking-[0.18em] uppercase">Employment</p>
          <p className="mt-2 text-sm font-semibold">{profileData.employeeProfile?.designation?.name ?? "Not linked"}</p>
          <p className="text-muted-foreground mt-1 text-xs">Organization-managed profile details shown for reference.</p>
        </div>
      </div>

      <Card className="overflow-hidden border-border/70 shadow-xs">
        <CardHeader className="border-b border-border/50 bg-[linear-gradient(180deg,color-mix(in_srgb,var(--background)_92%,white),color-mix(in_srgb,var(--secondary)_12%,transparent),color-mix(in_srgb,var(--primary)_8%,transparent))]">
          <CardTitle>My Profile</CardTitle>
          <p className="text-muted-foreground text-sm">
            View and edit your personal information. Employment details are managed by your organization.
          </p>
        </CardHeader>
        <CardContent>
          <ProfileForm initialData={profileData} />
        </CardContent>
      </Card>

      <Card className="overflow-hidden border-border/70 shadow-xs">
        <CardHeader className="border-b border-border/50 bg-[linear-gradient(180deg,color-mix(in_srgb,var(--background)_92%,white),color-mix(in_srgb,var(--secondary)_12%,transparent),color-mix(in_srgb,var(--primary)_8%,transparent))]">
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="size-5 text-muted-foreground" />
            Change password
          </CardTitle>
          <p className="text-muted-foreground text-sm">
            Update your account password. Use a strong password with at least 8
            characters, including uppercase, lowercase, and a number.
          </p>
        </CardHeader>
        <CardContent>
          <PasswordChangeModal />
        </CardContent>
      </Card>
    </div>
  );
}
