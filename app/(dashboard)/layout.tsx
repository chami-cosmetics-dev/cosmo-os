import { redirect } from "next/navigation";

import { DashboardTemplate } from "@/components/templates/dashboard-template";
import { getCurrentUserContext } from "@/lib/rbac";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const context = await getCurrentUserContext();
  if (!context?.sessionUser) {
    redirect("/login");
  }

  const avatarUrl =
    (context.user as { profilePhotoUrl?: string | null } | null)?.profilePhotoUrl ??
    context.sessionUser.picture ??
    null;

  return (
    <DashboardTemplate
      user={{
        name: context.sessionUser.name,
        email: context.sessionUser.email,
        picture: avatarUrl,
      }}
    >
      {children}
    </DashboardTemplate>
  );
}
