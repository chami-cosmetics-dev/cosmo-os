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

  return (
    <DashboardTemplate user={context.sessionUser}>
      {children}
    </DashboardTemplate>
  );
}
