import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Order details · Cosmetics.lk",
  description: "View your Cosmetics.lk order details",
};

export default function OrderStatusLayout({ children }: { children: React.ReactNode }) {
  return children;
}
