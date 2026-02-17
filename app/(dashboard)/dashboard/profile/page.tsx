import { redirect } from "next/navigation";

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
      <Card>
        <CardHeader>
          <CardTitle>My Profile</CardTitle>
          <p className="text-muted-foreground text-sm">
            View and edit your personal information. Employment details are managed by your organization.
          </p>
        </CardHeader>
        <CardContent>
          <ProfileForm initialData={profileData} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Change password</CardTitle>
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
