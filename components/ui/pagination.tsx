"use client";

import * as React from "react";
import { Check, ChevronLeft, ChevronRight, ChevronsUpDown } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

export interface PaginationProps {
  page: number;
  limit: number;
  total: number;
  onPageChange: (page: number) => void;
  onLimitChange?: (limit: number) => void;
  limitOptions?: number[];
  className?: string;
}

export function Pagination({
  page,
  limit,
  total,
  onPageChange,
  onLimitChange,
  limitOptions = [10, 25, 50, 100],
  className,
}: PaginationProps) {
  const limitControlId = React.useId();
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const start = total === 0 ? 0 : (page - 1) * limit + 1;
  const end = Math.min(page * limit, total);

  return (
    <div
      className={cn(
        "flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between",
        className
      )}
    >
      <div className="flex items-center gap-4">
        <p className="text-muted-foreground text-sm">
          Showing {start}–{end} of {total}
        </p>
        {onLimitChange && (
          <div className="flex items-center gap-2">
            <label htmlFor={limitControlId} className="text-muted-foreground text-sm">
              Per page
            </label>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  id={limitControlId}
                  type="button"
                  className="border-input bg-background/90 hover:bg-accent/30 focus-visible:border-ring focus-visible:ring-ring/50 flex h-10 min-w-20 items-center justify-between rounded-xl border border-border/70 px-3 text-sm font-medium outline-none transition-colors focus-visible:ring-[3px] dark:bg-input/40"
                >
                  <span>{limit}</span>
                  <ChevronsUpDown className="text-muted-foreground size-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-[var(--radix-dropdown-menu-trigger-width)]">
                {limitOptions.map((n) => (
                  <DropdownMenuItem
                    key={n}
                    onSelect={() => onLimitChange(n)}
                    className="justify-between"
                  >
                    <span>{n}</span>
                    {limit === n ? <Check className="size-4" aria-hidden /> : null}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}
      </div>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          aria-label="Previous page"
        >
          <ChevronLeft className="size-4" />
        </Button>
        <span className="text-muted-foreground text-sm">
          Page {page} of {totalPages}
        </span>
        <Button
          variant="outline"
          size="sm"
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages}
          aria-label="Next page"
        >
          <ChevronRight className="size-4" />
        </Button>
      </div>
    </div>
  );
}
