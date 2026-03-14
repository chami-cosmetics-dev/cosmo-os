import { redirect } from "next/navigation";

export default function StickerBatchHistoryPage() {
  redirect("/dashboard/sticker-batch?tab=history");
}
