import { FulfillmentNav } from "@/components/organisms/fulfillment-nav";

export default function FulfillmentLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-6">
      <FulfillmentNav />
      {children}
    </div>
  );
}
