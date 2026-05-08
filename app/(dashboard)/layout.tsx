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
  const permissionKeys = (context.permissionKeys ?? []) as string[];
  const roleNames = (context.roleNames ?? []) as string[];
  const isSeoOnly =
    permissionKeys.includes("seo.welcome") &&
    permissionKeys.length === 1 &&
    !roleNames.includes("admin") &&
    !roleNames.includes("super_admin");

  return (
    <DashboardTemplate
      user={{
        name: context.sessionUser.name,
        email: context.sessionUser.email,
        picture: avatarUrl,
      }}
      permissionKeys={permissionKeys}
      roleNames={roleNames}
      seoOnly={isSeoOnly}
    >
      {children}
    </DashboardTemplate>
  );
}
