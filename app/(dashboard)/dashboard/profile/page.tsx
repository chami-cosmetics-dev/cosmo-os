import { redirect } from "next/navigation";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ProfileForm } from "@/components/molecules/profile-form";
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

  const user = await prisma.user.findUnique({
    where: { id: context.user.id },
    select: {
      id: true,
      name: true,
      email: true,
      picture: true,
      nicNo: true,
      gender: true,
      dateOfBirth: true,
      mobile: true,
      knownName: true,
      userRoles: {
        include: {
          role: { select: { id: true, name: true } },
        },
      },
      employeeProfile: {
        include: {
          location: { select: { id: true, name: true } },
          department: { select: { id: true, name: true } },
          designation: { select: { id: true, name: true } },
        },
      },
    },
  });

  if (!user) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Profile</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-sm">User not found.</p>
        </CardContent>
      </Card>
    );
  }

  const profileData = {
    id: user.id,
    name: user.name,
    email: user.email,
    picture: user.picture,
    nicNo: user.nicNo,
    gender: user.gender,
    dateOfBirth: user.dateOfBirth,
    mobile: user.mobile,
    knownName: user.knownName,
    roles: user.userRoles.map((ur) => ur.role),
    employeeProfile: user.employeeProfile
      ? {
          employeeNumber: user.employeeProfile.employeeNumber,
          epfNumber: user.employeeProfile.epfNumber,
          location: user.employeeProfile.location,
          department: user.employeeProfile.department,
          designation: user.employeeProfile.designation,
          appointmentDate: user.employeeProfile.appointmentDate,
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
    </div>
  );
}
