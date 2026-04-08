"use client";

import { SamplesFreeIssuesSettingsForm } from "@/components/molecules/samples-free-issues-settings-form";
import { PackageHoldReasonsSettingsForm } from "@/components/molecules/package-hold-reasons-settings-form";
import { CourierServicesSettingsForm } from "@/components/molecules/courier-services-settings-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface FulfillmentSettingsDataProps {
  canEdit: boolean;
}

export function FulfillmentSettingsData({ canEdit }: FulfillmentSettingsDataProps) {
  if (!canEdit) {
    return (
      <Card>
        <CardHeader>
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
      <SamplesFreeIssuesSettingsForm canEdit={canEdit} />
      <PackageHoldReasonsSettingsForm canEdit={canEdit} />
      <CourierServicesSettingsForm canEdit={canEdit} />
    </div>
  );
}
