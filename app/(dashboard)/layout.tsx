import { redirect } from "next/navigation";

import { auth0 } from "@/lib/auth0";
import { DashboardTemplate } from "@/components/templates/dashboard-template";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth0.getSession();

  if (!session?.user) {
    redirect("/login");
  }

  return (
    <DashboardTemplate user={session.user}>
      {children}
    </DashboardTemplate>
  );
}
