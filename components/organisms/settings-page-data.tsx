"use client";

import { useState, useEffect } from "react";

import { CardSkeleton } from "@/components/skeletons/card-skeleton";
import { CompanySettingsForm } from "@/components/molecules/company-settings-form";
import { DepartmentsSettingsForm } from "@/components/molecules/departments-settings-form";
import { DesignationsSettingsForm } from "@/components/molecules/designations-settings-form";
import { LocationsSettingsForm } from "@/components/molecules/locations-settings-form";
import { ShopifyWebhookSecretsForm } from "@/components/molecules/shopify-webhook-secrets-form";
import { notify } from "@/lib/notify";

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
  locations: Array<{
    id: string;
    name: string;
    logoUrl: string | null;
    address: string | null;
    shortName: string | null;
    invoiceHeader: string | null;
    invoiceSubHeader: string | null;
    invoiceFooter: string | null;
    invoicePhone: string | null;
    invoiceEmail: string | null;
    shopifyLocationId: string | null;
    shopifyShopName: string | null;
    shopifyAdminStoreHandle: string | null;
    defaultMerchantUserId: string | null;
    createdAt?: string;
    updatedAt?: string;
  }>;
  merchants: Array<{ id: string; name: string | null; email: string | null }>;
  departments: Array<{ id: string; name: string }>;
  designations: Array<{ id: string; name: string }>;
  shopifyWebhookSecrets: Array<{
    id: string;
    name: string | null;
    secretMasked: string;
    createdAt: string;
  }>;
};

interface SettingsPageDataProps {
  canEdit: boolean;
}

export function SettingsPageData({ canEdit }: SettingsPageDataProps) {
  const [data, setData] = useState<SettingsPageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
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
  }, []);

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
    notify.error(error);
    return (
      <p className="text-muted-foreground text-sm py-4">
        {error}
      </p>
    );
  }

  if (!data) return null;

  return (
    <>
      <CompanySettingsForm
        canEdit={canEdit}
        initialCompany={data.company}
      />
      <LocationsSettingsForm
        canEdit={canEdit}
        initialLocations={data.locations}
        merchants={data.merchants}
      />
      <ShopifyWebhookSecretsForm
        canEdit={canEdit}
        initialSecrets={data.shopifyWebhookSecrets}
      />
      <DepartmentsSettingsForm
        canEdit={canEdit}
        initialDepartments={data.departments}
      />
      <DesignationsSettingsForm
        canEdit={canEdit}
        initialDesignations={data.designations}
      />
    </>
  );
}
