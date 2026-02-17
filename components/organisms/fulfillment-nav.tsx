"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { Package, PackageCheck, Printer, Truck } from "lucide-react";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { href: "/dashboard/fulfillment/sample-free-issue", label: "Sample/Free Issue", icon: Package },
  { href: "/dashboard/fulfillment/print", label: "Order Print", icon: Printer },
  { href: "/dashboard/fulfillment/dispatch", label: "Ready & Dispatch", icon: Truck },
  { href: "/dashboard/fulfillment/delivery-invoice", label: "Delivery & Invoice", icon: PackageCheck },
];

export function FulfillmentNav() {
  const pathname = usePathname();

  return (
    <nav className="flex flex-wrap gap-2 border-b pb-4">
      {NAV_ITEMS.map((item) => {
        const isActive = pathname === item.href;
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors",
              isActive
                ? "bg-primary text-primary-foreground"
                : "hover:bg-muted"
            )}
          >
            <Icon className="size-4" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
