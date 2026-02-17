import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default function FulfillmentIndexPage() {
  redirect("/dashboard/fulfillment/sample-free-issue");
}
