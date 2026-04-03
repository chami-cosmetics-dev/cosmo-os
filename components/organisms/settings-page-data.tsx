"use client";

import { useState, useEffect } from "react";

import { CardSkeleton } from "@/components/skeletons/card-skeleton";
import { CompanySettingsForm } from "@/components/molecules/company-settings-form";
import { DepartmentsSettingsForm } from "@/components/molecules/departments-settings-form";
import { DesignationsSettingsForm } from "@/components/molecules/designations-settings-form";
import { SuppliersSettingsForm } from "@/components/molecules/suppliers-settings-form";
import { LocationsSettingsForm } from "@/components/molecules/locations-settings-form";
import { ShopifyWebhookSecretsForm } from "@/components/molecules/shopify-webhook-secrets-form";
import type { LocationsSettingsInitialData } from "@/lib/page-data/locations-settings";
import { notify } from "@/lib/notify";
import { Building2 } from "lucide-react";

export type SettingsPageData = {
  company: {
    id: string;
    name: string;
    logoUrl: string | null;
    faviconUrl: string | null;
    employeeSize: string | null;
    address: string | null;
    createdAt: string;
    updatedAt: string;
  } | null;
};

interface SettingsPageDataProps {
  canEdit: boolean;
  initialData?: SettingsPageData | null;
  /** Server-prefetched locations (avoids client-only failure if API errors). */
  initialLocationsData?: LocationsSettingsInitialData | null;
}

export function SettingsPageData({
  canEdit,
  initialData = null,
  initialLocationsData = null,
}: SettingsPageDataProps) {
  const [data, setData] = useState<SettingsPageData | null>(initialData);
  const [loading, setLoading] = useState(!initialData);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (initialData) {
      return;
    }

    async function fetchData() {
      try {
        const res = await fetch("/api/admin/settings/page-data");
        if (!res.ok) {
          const json = (await res.json()) as { error?: string };
          setError(json.error ?? "Failed to load settings");
          return;
        }
        const json = (await res.json()) as SettingsPageData;
        setData(json);
      } catch {
        setError("Failed to load settings");
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [initialData]);

  useEffect(() => {
    if (!error) return;
    notify.error(error);
  }, [error]);

  if (loading) {
    return (
      <div className="space-y-6">
        <CardSkeleton title description contentLines={4} />
        <CardSkeleton title description contentLines={2} />
        <CardSkeleton title description contentLines={2} />
      </div>
    );
  }

  if (error) {
    return (
      <p className="text-muted-foreground text-sm py-4">
        {error}
      </p>
    );
  }

  if (!data) return null;

  return (
    <div className="space-y-6">
      <CompanySettingsForm
        canEdit={canEdit}
        initialCompany={data.company}
      />
      <div className="space-y-2 rounded-xl border bg-muted/10 p-4">
        <p className="flex items-center gap-2 text-sm font-semibold">
          <Building2 className="size-4 text-muted-foreground" aria-hidden />
          Company Configuration
        </p>
        <p className="text-muted-foreground text-xs">
          Each section is shown as its own card for faster access.
        </p>
      </div>

      <LocationsSettingsForm
        canEdit={canEdit}
        initialLocationsData={initialLocationsData ?? undefined}
      />
      <ShopifyWebhookSecretsForm canEdit={canEdit} />
      <DepartmentsSettingsForm canEdit={canEdit} />
      <DesignationsSettingsForm canEdit={canEdit} />
      <SuppliersSettingsForm canEdit={canEdit} />
    </div>
  );
}
