import Link from "next/link";
import type { ComponentType } from "react";

import { SettingsPageData } from "@/components/organisms/settings-page-data";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getCurrentUserContext, hasPermission } from "@/lib/rbac";
import { Building2, ChevronRight, Mail, MessageSquare, Package } from "lucide-react";

export const dynamic = "force-dynamic";

type SettingLink = {
  key: string;
  title: string;
  description: string;
  href: string;
  actionLabel: string;
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

  const settingLinks: SettingLink[] = [
    ...(canManageEmailTemplates
      ? [
          {
            key: "email-templates",
            title: "Email Templates",
            description:
              "Configure notification emails for staff events such as resignations.",
            href: "/dashboard/settings/email-templates",
            actionLabel: "Manage email templates",
            icon: Mail,
          },
        ]
      : []),
    ...(canManageSmsPortal
      ? [
          {
            key: "sms-portal",
            title: "SMS Portal",
            description:
              "Configure Hutch SMS API credentials for sending SMS. Sent messages are counted for tracking.",
            href: "/dashboard/settings/sms-portal",
            actionLabel: "Configure SMS portal",
            icon: MessageSquare,
          },
          {
            key: "sms-notifications",
            title: "SMS Notifications",
            description:
              "Configure order lifecycle SMS (order received, package ready, dispatched, delivery complete).",
            href: "/dashboard/settings/sms-notifications",
            actionLabel: "Order SMS notifications",
            icon: MessageSquare,
          },
        ]
      : []),
    ...(canManageFulfillment
      ? [
          {
            key: "fulfillment",
            title: "Order Fulfillment",
            description:
              "Manage samples, free issues, package hold reasons, and courier services.",
            href: "/dashboard/settings/fulfillment",
            actionLabel: "Fulfillment settings",
            icon: Package,
          },
        ]
      : []),
  ];

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

      {canManageCompany && <SettingsPageData canEdit={true} />}

      {settingLinks.length > 0 && (
        <div className="grid gap-4 md:grid-cols-2">
          {settingLinks.map((link) => {
            const Icon = link.icon;
            return (
              <Card key={link.key} className="transition-colors hover:bg-muted/30">
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Icon className="size-4 text-muted-foreground" aria-hidden />
                    {link.title}
                  </CardTitle>
                  <CardDescription>{link.description}</CardDescription>
                </CardHeader>
                <CardContent>
                  <Button variant="outline" className="w-full justify-between sm:w-auto" asChild>
                    <Link href={link.href}>
                      <span className="inline-flex items-center gap-2">
                        <Icon className="size-4" aria-hidden />
                        {link.actionLabel}
                      </span>
                      <ChevronRight className="size-4" aria-hidden />
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            );
          })}
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
