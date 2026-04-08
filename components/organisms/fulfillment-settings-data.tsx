"use client";

import { SamplesFreeIssuesSettingsForm } from "@/components/molecules/samples-free-issues-settings-form";
import { PackageHoldReasonsSettingsForm } from "@/components/molecules/package-hold-reasons-settings-form";
import { CourierServicesSettingsForm } from "@/components/molecules/courier-services-settings-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Package, Truck, Gift } from "lucide-react";

interface FulfillmentSettingsDataProps {
  canEdit: boolean;
}

export function FulfillmentSettingsData({ canEdit }: FulfillmentSettingsDataProps) {
  if (!canEdit) {
    return (
      <Card className="overflow-hidden border-border/70 shadow-xs">
        <CardHeader className="border-b border-border/50 bg-[linear-gradient(180deg,color-mix(in_srgb,var(--background)_92%,white),color-mix(in_srgb,var(--secondary)_12%,transparent))]">
          <CardTitle>Settings</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-sm">
            Company settings are available to users with the appropriate
            permissions. Contact your administrator to update company
            information.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-3 md:grid-cols-3">
        <div className="rounded-2xl border border-border/70 bg-[linear-gradient(135deg,color-mix(in_srgb,var(--background)_95%,white),color-mix(in_srgb,var(--secondary)_8%,transparent))] p-4 shadow-xs">
          <p className="flex items-center gap-2 text-sm font-semibold">
            <Gift className="size-4 text-muted-foreground" aria-hidden />
            Samples & Free Issues
          </p>
          <p className="text-muted-foreground mt-1 text-xs">
            Maintain the items available for goodwill additions and free distributions.
          </p>
        </div>
        <div className="rounded-2xl border border-border/70 bg-[linear-gradient(135deg,color-mix(in_srgb,var(--background)_95%,white),color-mix(in_srgb,var(--primary)_8%,transparent))] p-4 shadow-xs">
          <p className="flex items-center gap-2 text-sm font-semibold">
            <Package className="size-4 text-muted-foreground" aria-hidden />
            Hold Reasons
          </p>
          <p className="text-muted-foreground mt-1 text-xs">
            Keep package exceptions structured for dispatch and warehouse teams.
          </p>
        </div>
        <div className="rounded-2xl border border-border/70 bg-[linear-gradient(135deg,color-mix(in_srgb,var(--background)_95%,white),color-mix(in_srgb,var(--secondary)_10%,transparent),color-mix(in_srgb,var(--primary)_6%,transparent))] p-4 shadow-xs">
          <p className="flex items-center gap-2 text-sm font-semibold">
            <Truck className="size-4 text-muted-foreground" aria-hidden />
            Courier Services
          </p>
          <p className="text-muted-foreground mt-1 text-xs">
            Define external delivery partners used during fulfillment operations.
          </p>
        </div>
      </div>
      <SamplesFreeIssuesSettingsForm canEdit={canEdit} />
      <PackageHoldReasonsSettingsForm canEdit={canEdit} />
      <CourierServicesSettingsForm canEdit={canEdit} />
    </div>
  );
}
