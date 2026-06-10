import type { CompletedDelivery } from "@/src/storage/completed-deliveries";
import type { MobileDelivery } from "@/src/types";

type RenderableDelivery = Pick<MobileDelivery, "id" | "orderLabel" | "amount">;

export function isRenderableDelivery(delivery: RenderableDelivery | CompletedDelivery) {
  return (
    typeof delivery.id === "string" &&
    delivery.id.trim().length > 0 &&
    typeof delivery.orderLabel === "string" &&
    delivery.orderLabel.trim().length > 0 &&
    typeof delivery.amount === "string" &&
    delivery.amount.trim().length > 0
  );
}
