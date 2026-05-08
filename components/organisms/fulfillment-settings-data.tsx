"use client";

import { SamplesFreeIssuesSettingsForm } from "@/components/molecules/samples-free-issues-settings-form";
import { PackageHoldReasonsSettingsForm } from "@/components/molecules/package-hold-reasons-settings-form";
import { CourierServicesSettingsForm } from "@/components/molecules/courier-services-settings-form";

interface FulfillmentSettingsDataProps {
  canEdit: boolean;
}

export function FulfillmentSettingsData({ canEdit }: FulfillmentSettingsDataProps) {
  return (
    <div className="space-y-6">
      <SamplesFreeIssuesSettingsForm canEdit={canEdit} />
      <PackageHoldReasonsSettingsForm canEdit={canEdit} />
      <CourierServicesSettingsForm canEdit={canEdit} />
    </div>
  );
}
