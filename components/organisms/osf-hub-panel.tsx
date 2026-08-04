"use client";

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

export function OsfHubPanel({
  canManage,
  canManageThreshold = false,
  canReorderOnly = false,
  canAssignColumns = false,
  initialLocations,
}: Props) {
  return (
    <div className="space-y-8 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Order Support File</h1>
        <p className="text-sm text-muted-foreground">
          Maintain ROP / Shop Availability / OGF Price / reorder threshold %, then generate
          the Main OSF workbook (or reorder-only when permitted).
        </p>
      </div>

      <section className="rounded-lg border p-4">
        <OsfGeneratePanel canReorderOnly={canReorderOnly} />
      </section>

      <section className="rounded-lg border p-4">
        <OsfSupplierOrdersPanel />
      </section>

      {canManage && (
        <section className="rounded-lg border p-4">
          <OsfRopImportPanel />
        </section>
      )}

      {canAssignColumns && (
        <section className="rounded-lg border p-4">
          <OsfColumnAccessPanel />
        </section>
      )}

      <section className="rounded-lg border p-4">
        <OsfProductEditor canManage={canManage} canManageThreshold={canManageThreshold} />
      </section>

      <section className="rounded-lg border p-4">
        <OsfColumnsSettings canManage={canManage} initialLocations={initialLocations} />
      </section>
    </div>
  );
}
