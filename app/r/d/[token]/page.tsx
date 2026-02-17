import { RiderDeliveryConfirm } from "@/components/organisms/rider-delivery-confirm";

export const dynamic = "force-dynamic";

export default async function RiderDeliveryPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return <RiderDeliveryConfirm token={token} />;
}
