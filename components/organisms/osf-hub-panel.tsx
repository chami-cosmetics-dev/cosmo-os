"use client";

import type { ReactNode } from "react";

import { OsfColumnAccessPanel } from "@/components/organisms/osf-column-access-panel";
import { OsfColumnsSettings } from "@/components/organisms/osf-columns-settings";
import { OsfGeneratePanel } from "@/components/organisms/osf-generate-panel";
import { OsfProductEditor } from "@/components/organisms/osf-product-editor";
import { OsfRopImportPanel } from "@/components/organisms/osf-rop-import-panel";
import { OsfSupplierOrdersPanel } from "@/components/organisms/osf-supplier-orders-panel";

type LocationOption = { id: string; name: string; shortName: string | null };

type Props = {
  canManage: boolean;
  canManageThreshold?: boolean;
  canReorderOnly?: boolean;
  canAssignColumns?: boolean;
  initialLocations: LocationOption[];
};

function HubSection({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
        {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
      </div>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

function HubCard({ children }: { children: ReactNode }) {
  return <div className="rounded-lg border p-4">{children}</div>;
}

export function OsfHubPanel({
  canManage,
  canManageThreshold = false,
  canReorderOnly = false,
  canAssignColumns = false,
  initialLocations,
}: Props) {
  return (
    <div className="space-y-10 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Order Support File</h1>
        <p className="text-sm text-muted-foreground">
          Set ROP, shop availability, OGF price, and threshold, then download the workbook
          and build supplier orders.
        </p>
      </div>

      <HubSection
        title="1. Maintain products"
        description="Edit SKUs on this page, or bulk-update warehouse ROPs from Excel."
      >
        <HubCard>
          <OsfProductEditor canManage={canManage} canManageThreshold={canManageThreshold} />
        </HubCard>
        {canManage ? (
          <HubCard>
            <OsfRopImportPanel />
          </HubCard>
        ) : null}
      </HubSection>

      <HubSection
        title="2. Generate workbook"
        description="Download Main OSF (or reorder-only when permitted). Missing ERP stock/cost stays blank."
      >
        <HubCard>
          <OsfGeneratePanel canReorderOnly={canReorderOnly} />
        </HubCard>
      </HubSection>

      <HubSection
        title="3. Supplier orders"
        description="Allocate reorder qty across suppliers and export order files."
      >
        <HubCard>
          <OsfSupplierOrdersPanel />
        </HubCard>
      </HubSection>

      <HubSection
        title="4. Setup"
        description="Warehouse/shop columns in the Excel file, and which columns each buyer receives."
      >
        <HubCard>
          <OsfColumnsSettings canManage={canManage} initialLocations={initialLocations} />
        </HubCard>
        {canAssignColumns ? (
          <HubCard>
            <OsfColumnAccessPanel />
          </HubCard>
        ) : null}
      </HubSection>
    </div>
  );
}
