import { redirect } from "next/navigation";

export default function NewItemRequestsRedirectPage() {
  redirect("/dashboard/orders/stock-requests?tab=new-items");
}
