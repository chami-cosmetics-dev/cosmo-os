import { redirect } from "next/navigation";

import { BookNotesPanel } from "@/app/(dashboard)/dashboard/book-notes/book-notes-panel";
import { PermissionDeniedCard } from "@/components/molecules/permission-denied-card";
import { formatAppIsoDate } from "@/lib/format-datetime";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";

export const dynamic = "force-dynamic";

export default async function BookNotesPage() {
  const auth = await requirePermission("book_notes.manage");
  if (!auth.ok) {
    if (auth.status === 401) redirect("/login");
    return <PermissionDeniedCard />;
  }

  const companyId = auth.context!.user?.companyId ?? null;
  if (!companyId) {
    redirect("/dashboard");
  }

  const locations = await prisma.companyLocation.findMany({
    where: { companyId },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      shortName: true,
      erpnextCompany: true,
    },
  });

  return (
    <BookNotesPanel
      initialLocations={locations}
      initialToday={formatAppIsoDate(new Date())}
    />
  );
}
