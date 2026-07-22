import { redirect } from "next/navigation";

export default async function StickerPrintPage({
  searchParams,
}: {
  searchParams?: Promise<{ batchId?: string }>;
}) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const batchId = resolvedSearchParams?.batchId?.trim() ?? "";
  const qs = batchId
    ? `?batchId=${encodeURIComponent(batchId)}`
    : "";
  redirect(`/dashboard/sticker-batch${qs}`);
}
