"use client";

import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";

import { cn } from "@/lib/utils";

type SortOrder = "asc" | "desc";

interface SortableColumnHeaderProps {
  label: string;
  sortKey: string;
  currentSort?: string;
  currentOrder?: SortOrder;
  onSort: (key: string, order: SortOrder) => void;
  align?: "left" | "center" | "right";
  className?: string;
}

export function SortableColumnHeader({
  label,
  sortKey,
  currentSort,
  currentOrder,
  onSort,
  align = "left",
  className,
}: SortableColumnHeaderProps) {
  const isActive = currentSort === sortKey;

  function handleClick() {
    if (isActive && currentOrder === "asc") {
      onSort(sortKey, "desc");
    } else {
      onSort(sortKey, "asc");
    }
  }

  return (
    <th
      className={cn(
        "cursor-pointer select-none px-4 py-2 font-medium transition-colors hover:bg-muted/70",
        align === "right" && "text-right",
        align === "center" && "text-center",
        className
      )}
      onClick={handleClick}
      role="columnheader"
      aria-sort={isActive ? (currentOrder === "asc" ? "ascending" : "descending") : undefined}
    >
      <div
        className={cn(
          "inline-flex items-center gap-1",
          align === "right" && "justify-end",
          align === "center" && "justify-center"
        )}
      >
        {label}
        {isActive ? (
          currentOrder === "asc" ? (
            <ArrowUp className="size-3.5 shrink-0" aria-hidden />
          ) : (
            <ArrowDown className="size-3.5 shrink-0" aria-hidden />
          )
        ) : (
          <ArrowUpDown className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
        )}
      </div>
    </th>
  );
}
