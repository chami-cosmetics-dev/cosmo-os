import { redirect } from "next/navigation";

import { BookNotesPanel } from "@/app/(dashboard)/dashboard/book-notes/book-notes-panel";
import { PermissionDeniedCard } from "@/components/molecules/permission-denied-card";
import { resolveBookNoteShopAccess, resolveBookNoteWriteAccess } from "@/lib/book-notes/access";
import { loadBookNoteHistory } from "@/lib/book-notes/load";
import { formatAppIsoDate } from "@/lib/format-datetime";
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

  const access = await resolveBookNoteShopAccess(auth.context!, companyId);
  const writeAccess = resolveBookNoteWriteAccess(auth.context!);
  const locations = access.locations;
  const allowedIds = locations.map((l) => l.id);
  const initialLocationId = locations[0]?.id ?? "";
  const canBackdateBookNotes = writeAccess.canBackdate;

  const initialHistory =
    allowedIds.length > 0
      ? await loadBookNoteHistory({
          companyId,
          companyLocationId: access.canAccessAllShops
            ? undefined
            : initialLocationId || undefined,
          companyLocationIds: allowedIds,
          writeAccess,
        })
      : [];

  return (
    <BookNotesPanel
      initialLocations={locations}
      initialCanAccessAllShops={access.canAccessAllShops}
      initialCanBackdateBookNotes={canBackdateBookNotes}
      initialHistory={initialHistory}
      initialToday={formatAppIsoDate(new Date())}
    />
  );
}
