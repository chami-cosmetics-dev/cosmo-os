"use client";

import { useState } from "react";

import { NewItemRequestBrandBoard } from "@/components/organisms/new-item-request-brand-board";
import { NewItemRequestForm } from "@/components/organisms/new-item-request-form";
import { NewItemRequestOwnList } from "@/components/organisms/new-item-request-own-list";
import type { NewItemRequestBrandGroup, NewItemRequestView } from "@/lib/new-item-requests/types";

export type NewItemRequestPanelProps = {
  isAdmin: boolean;
  initialRequests: NewItemRequestView[];
  initialBrands: NewItemRequestBrandGroup[];
  /** Hide the page heading when this panel sits inside Stock Requests tabs. */
  embedded?: boolean;
};

export function NewItemRequestPanel({
  isAdmin,
  initialRequests,
  initialBrands,
  embedded = false,
}: NewItemRequestPanelProps) {
  const [created, setCreated] = useState<NewItemRequestView[]>([]);
  const [boardKey, setBoardKey] = useState(0);

  return (
    <div className="space-y-6">
      <section className="space-y-1">
        {!embedded ? (
          <>
            <p className="text-muted-foreground text-xs font-semibold tracking-[0.2em] uppercase">
              New item requests
            </p>
            <h1 className="text-2xl font-semibold tracking-tight">Customer item asks</h1>
          </>
        ) : null}
        <p className="text-muted-foreground max-w-2xl text-sm">
          Merchants capture demand. Purchasing reviews it brand by brand. This screen does not create
          catalogue items.
        </p>
      </section>
      <NewItemRequestForm
        onCreated={(request) => {
          setCreated((current) => [request, ...current]);
          if (isAdmin) setBoardKey((value) => value + 1);
        }}
      />
      {isAdmin ? (
        <NewItemRequestBrandBoard key={boardKey} initialBrands={initialBrands} />
      ) : (
        <NewItemRequestOwnList initialRequests={initialRequests} extraRequests={created} />
      )}
    </div>
  );
}
