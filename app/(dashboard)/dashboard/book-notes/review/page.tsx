import { redirect } from "next/navigation";

import { BookNoteFinancePanel } from "@/app/(dashboard)/dashboard/book-notes/review/finance-panel";
import { PermissionDeniedCard } from "@/components/molecules/permission-denied-card";
import { resolveBookNoteShopAccess } from "@/lib/book-notes/access";
import { loadBookNoteFinanceReview } from "@/lib/book-notes/finance-review";
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

export default async function BookNoteReviewPage() {
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
  const review = await loadBookNoteFinanceReview({
    companyId,
    fromYmd: from,
    toYmd: to,
  });

  return (
    <BookNoteFinancePanel
      initialLocations={access.locations}
      initialDays={review.days}
      initialSummary={review.summary}
      initialTruncated={review.truncated}
      initialFrom={from}
      initialTo={to}
      today={formatAppIsoDate(new Date())}
    />
  );
}
