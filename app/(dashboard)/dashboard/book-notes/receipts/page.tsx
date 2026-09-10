import { redirect } from "next/navigation";

import { BookNoteReceiptGalleryPanel } from "@/app/(dashboard)/dashboard/book-notes/receipts/receipt-gallery-panel";
import { PermissionDeniedCard } from "@/components/molecules/permission-denied-card";
import { resolveBookNoteShopAccess } from "@/lib/book-notes/access";
import { loadBookNoteReceiptGallery } from "@/lib/book-notes/load";
import { formatAppIsoDate } from "@/lib/format-datetime";
import { requirePermission } from "@/lib/rbac";

export const dynamic = "force-dynamic";

/** Default window: the last 7 days including today. */
function defaultRange(): { from: string; to: string } {
  const to = new Date();
  const from = new Date(to);
  from.setDate(from.getDate() - 6);
  return { from: formatAppIsoDate(from), to: formatAppIsoDate(to) };
}

export default async function BookNoteReceiptsPage() {
  const auth = await requirePermission("book_notes.read");
  if (!auth.ok) {
    if (auth.status === 401) redirect("/login");
    return <PermissionDeniedCard />;
  }

  const companyId = auth.context!.user?.companyId ?? null;
  if (!companyId) {
    redirect("/dashboard");
  }

  const access = await resolveBookNoteShopAccess(auth.context!, companyId);
  const { from, to } = defaultRange();
  const initialItems = await loadBookNoteReceiptGallery({
    companyId,
    fromYmd: from,
    toYmd: to,
  });

  return (
    <BookNoteReceiptGalleryPanel
      initialLocations={access.locations}
      initialItems={initialItems}
      initialFrom={from}
      initialTo={to}
      today={formatAppIsoDate(new Date())}
    />
  );
}
