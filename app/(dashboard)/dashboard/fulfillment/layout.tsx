import { FulfillmentNav } from "@/components/organisms/fulfillment-nav";
import { buildFulfillmentNavPermissions } from "@/lib/fulfillment-permissions";
import { getCurrentUserContext } from "@/lib/rbac";

export default async function FulfillmentLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const context = await getCurrentUserContext();
  const navPermissions = buildFulfillmentNavPermissions(context);

  return (
    <div className="space-y-6">
      <FulfillmentNav permissions={navPermissions} />
      {children}
    </div>
  );
}
