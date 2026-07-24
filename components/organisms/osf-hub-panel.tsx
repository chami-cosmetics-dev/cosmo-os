"use client";

import { OsfBuyersSettings, type BuyerRow } from "@/components/organisms/osf-buyers-settings";
import { OsfColumnAccessPanel } from "@/components/organisms/osf-column-access-panel";
import { OsfColumnsSettings } from "@/components/organisms/osf-columns-settings";
import { OsfGeneratePanel } from "@/components/organisms/osf-generate-panel";
import { OsfProductEditor } from "@/components/organisms/osf-product-editor";
import { OsfRopAssistPanel } from "@/components/organisms/osf-rop-assist-panel";
import { OsfRopImportPanel } from "@/components/organisms/osf-rop-import-panel";

type LocationOption = { id: string; name: string; shortName: string | null };

type Props = {
  canManage: boolean;
  canReadOsf?: boolean;
  canManageThreshold?: boolean;
  canReorderOnly?: boolean;
  canAssignColumns?: boolean;
  initialLocations: LocationOption[];
  initialBuyers?: BuyerRow[];
  brandOptions?: string[];
};

export function OsfHubPanel({
  canManage,
  canReadOsf = false,
  canManageThreshold = false,
  canReorderOnly = false,
  canAssignColumns = false,
  initialLocations,
  initialBuyers,
  brandOptions,
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

      {canReadOsf && (
        <section className="rounded-lg border p-4">
          <OsfRopAssistPanel canManageRops={canManage} />
        </section>
      )}

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

      <section className="rounded-lg border p-4">
        <OsfBuyersSettings
          canManage={canManage}
          initialBuyers={initialBuyers}
          brandOptions={brandOptions ?? []}
        />
      </section>
    </div>
  );
}
