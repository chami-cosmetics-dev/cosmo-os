"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { Package, PackageCheck, Printer, Truck } from "lucide-react";
import { cn } from "@/lib/utils";
import type { FulfillmentNavPermissions } from "@/lib/fulfillment-permissions";

const NAV_ITEMS: Array<{
  href: string;
  label: string;
  icon: typeof Package;
  permissionKey: keyof FulfillmentNavPermissions;
}> = [
  {
    href: "/dashboard/fulfillment/sample-free-issue",
    label: "Sample/Free Issue",
    icon: Package,
    permissionKey: "canViewSampleFreeIssue",
  },
  {
    href: "/dashboard/fulfillment/print",
    label: "Order Print",
    icon: Printer,
    permissionKey: "canViewOrderPrint",
  },
  {
    href: "/dashboard/fulfillment/dispatch",
    label: "Ready & Dispatch",
    icon: Truck,
    permissionKey: "canViewReadyDispatch",
  },
  {
    href: "/dashboard/fulfillment/delivery-invoice",
    label: "Delivery & Invoice",
    icon: PackageCheck,
    permissionKey: "canViewDeliveryInvoice",
  },
];

interface FulfillmentNavProps {
  permissions: FulfillmentNavPermissions;
}

export function FulfillmentNav({ permissions }: FulfillmentNavProps) {
  const pathname = usePathname();
  const visibleItems = NAV_ITEMS.filter((item) => permissions[item.permissionKey]);

  return (
    <nav className="flex flex-wrap gap-2 border-b pb-4">
      {visibleItems.map((item) => {
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
