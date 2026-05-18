import { redirect } from "next/navigation";

import { CosmoAcademyPrototype } from "@/components/organisms/cosmo-academy-prototype";
import { PermissionDeniedCard } from "@/components/molecules/permission-denied-card";
import { requireAnyPermission } from "@/lib/rbac";

export const dynamic = "force-dynamic";

export default async function CosmoAcademyPage() {
  const auth = await requireAnyPermission(["academy.learn", "academy.manage"]);
  if (!auth.ok) {
    if (auth.status === 401) redirect("/login");
    return <PermissionDeniedCard />;
  }

  return <CosmoAcademyPrototype />;
}
