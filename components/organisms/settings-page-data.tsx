"use client";

import { useState, useEffect } from "react";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { CardSkeleton } from "@/components/skeletons/card-skeleton";
import { CompanySettingsForm } from "@/components/molecules/company-settings-form";
import { DepartmentsSettingsForm } from "@/components/molecules/departments-settings-form";
import { DesignationsSettingsForm } from "@/components/molecules/designations-settings-form";
import { SuppliersSettingsForm } from "@/components/molecules/suppliers-settings-form";
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
    <div className="space-y-6">
      <CompanySettingsForm
        canEdit={canEdit}
        initialCompany={data.company}
      />
      <Accordion
        type="multiple"
        defaultValue={[]}
        className="rounded-lg border"
      >
        <AccordionItem value="locations" className="px-4">
          <AccordionTrigger>Company Locations</AccordionTrigger>
          <AccordionContent>
            <LocationsSettingsForm canEdit={canEdit} />
          </AccordionContent>
        </AccordionItem>
        <AccordionItem value="webhooks" className="px-4">
          <AccordionTrigger>Shopify Webhook Secrets</AccordionTrigger>
          <AccordionContent>
            <ShopifyWebhookSecretsForm canEdit={canEdit} />
          </AccordionContent>
        </AccordionItem>
        <AccordionItem value="departments" className="px-4">
          <AccordionTrigger>Departments</AccordionTrigger>
          <AccordionContent>
            <DepartmentsSettingsForm canEdit={canEdit} />
          </AccordionContent>
        </AccordionItem>
        <AccordionItem value="designations" className="px-4">
          <AccordionTrigger>Designations</AccordionTrigger>
          <AccordionContent>
            <DesignationsSettingsForm canEdit={canEdit} />
          </AccordionContent>
        </AccordionItem>
        <AccordionItem value="suppliers" className="px-4">
          <AccordionTrigger>Suppliers</AccordionTrigger>
          <AccordionContent>
            <SuppliersSettingsForm canEdit={canEdit} />
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  );
}
