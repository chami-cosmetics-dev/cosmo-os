import Link from "next/link";
import type { ComponentType } from "react";

import {
  SettingsPageData,
  type SettingsPageData as SettingsPageDataType,
} from "@/components/organisms/settings-page-data";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getLocationsSettingsInitialData } from "@/lib/page-data/locations-settings";
import { prisma } from "@/lib/prisma";
import { getCurrentUserContext, hasPermission } from "@/lib/rbac";
import { Building2, ChevronRight, Mail, MessageSquare, Package } from "lucide-react";

export const dynamic = "force-dynamic";

type SettingLink = {
  key: string;
  group: "Communication" | "Operations";
  title: string;
  description: string;
  href: string;
  icon: ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
};

export default async function SettingsPage() {
  const context = await getCurrentUserContext();
  const canManageCompany = context
    ? hasPermission(context, "settings.company")
    : false;
  const canManageEmailTemplates = context
    ? hasPermission(context, "settings.email_templates")
    : false;
  const canManageSmsPortal = context
    ? hasPermission(context, "settings.sms_portal")
    : false;
  const canManageFulfillment = context
    ? hasPermission(context, "settings.fulfillment")
    : false;
  const companyId = context?.user?.companyId ?? null;

  let initialSettingsData: SettingsPageDataType | null = null;
  let locationsInitial: Awaited<ReturnType<typeof getLocationsSettingsInitialData>> | null = null;
  if (canManageCompany && companyId) {
    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: {
        id: true,
        name: true,
        logoUrl: true,
        faviconUrl: true,
        employeeSize: true,
        address: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    initialSettingsData = {
      company: company
        ? {
            ...company,
            createdAt: company.createdAt.toISOString(),
            updatedAt: company.updatedAt.toISOString(),
          }
        : null,
    };

    try {
      locationsInitial = await getLocationsSettingsInitialData(companyId);
    } catch (e) {
      console.error("[settings] Failed to prefetch locations (run prisma migrate / db push):", e);
      locationsInitial = null;
    }
  }

  const settingLinks: SettingLink[] = [
    ...(canManageEmailTemplates
      ? [
          {
            key: "email-templates",
            group: "Communication" as const,
            title: "Email Templates",
            description:
              "Configure notification emails for staff events such as resignations.",
            href: "/dashboard/settings/email-templates",
            icon: Mail,
          },
        ]
      : []),
    ...(canManageSmsPortal
      ? [
          {
            key: "sms-portal",
            group: "Communication" as const,
            title: "SMS Portal",
            description:
              "Configure Hutch SMS API credentials for sending SMS. Sent messages are counted for tracking.",
            href: "/dashboard/settings/sms-portal",
            icon: MessageSquare,
          },
          {
            key: "sms-notifications",
            group: "Communication" as const,
            title: "SMS Notifications",
            description:
              "Configure order lifecycle SMS (order received, package ready, dispatched, delivery complete).",
            href: "/dashboard/settings/sms-notifications",
            icon: MessageSquare,
          },
        ]
      : []),
    ...(canManageFulfillment
      ? [
          {
            key: "fulfillment",
            group: "Operations" as const,
            title: "Order Fulfillment",
            description:
              "Manage samples, free issues, package hold reasons, and courier services.",
            href: "/dashboard/settings/fulfillment",
            icon: Package,
          },
        ]
      : []),
  ];

  const communicationLinks = settingLinks.filter((link) => link.group === "Communication");
  const operationsLinks = settingLinks.filter((link) => link.group === "Operations");

  return (
    <div className="space-y-6">
      <Card className="bg-gradient-to-r from-muted/70 via-background to-background">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="size-4 text-muted-foreground" aria-hidden />
            Settings
          </CardTitle>
          <CardDescription>
            Manage your organization details and operational preferences in one place.
          </CardDescription>
        </CardHeader>
      </Card>

      {canManageCompany && (
        <SettingsPageData
          canEdit={true}
          initialData={initialSettingsData}
          initialLocationsData={locationsInitial}
        />
      )}

      {settingLinks.length > 0 && (
        <div className="space-y-4">
          {communicationLinks.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Communication</CardTitle>
                <CardDescription>Email and SMS related settings.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {communicationLinks.map((link) => {
                  const Icon = link.icon;
                  return (
                    <Link
                      key={link.key}
                      href={link.href}
                      className="group flex items-center justify-between gap-3 rounded-lg border bg-background p-3 transition-colors hover:bg-muted/40"
                    >
                      <div className="min-w-0">
                        <p className="flex items-center gap-2 text-sm font-medium">
                          <Icon className="size-4 text-muted-foreground" aria-hidden />
                          {link.title}
                        </p>
                        <p className="text-muted-foreground mt-1 text-xs">{link.description}</p>
                      </div>
                      <ChevronRight className="size-4" aria-hidden />
                    </Link>
                  );
                })}
              </CardContent>
            </Card>
          )}

          {operationsLinks.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Operations</CardTitle>
                <CardDescription>Order and fulfillment related settings.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {operationsLinks.map((link) => {
                  const Icon = link.icon;
                  return (
                    <Link
                      key={link.key}
                      href={link.href}
                      className="group flex items-center justify-between gap-3 rounded-lg border bg-background p-3 transition-colors hover:bg-muted/40"
                    >
                      <div className="min-w-0">
                        <p className="flex items-center gap-2 text-sm font-medium">
                          <Icon className="size-4 text-muted-foreground" aria-hidden />
                          {link.title}
                        </p>
                        <p className="text-muted-foreground mt-1 text-xs">{link.description}</p>
                      </div>
                      <ChevronRight className="size-4" aria-hidden />
                    </Link>
                  );
                })}
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {!canManageCompany && settingLinks.length === 0 && (
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
      )}
    </div>
  );
}
