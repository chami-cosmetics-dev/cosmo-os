import Link from "next/link";

import { SettingsPageData } from "@/components/organisms/settings-page-data";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getCurrentUserContext, hasPermission } from "@/lib/rbac";
import {
  ChevronRight,
  Mail,
  MessageSquare,
  Package,
  Settings2,
  ShieldCheck,
} from "lucide-react";

export const dynamic = "force-dynamic";

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
  const hasAnySettingsAccess =
    canManageCompany || canManageEmailTemplates || canManageSmsPortal || canManageFulfillment;

  return (
    <div className="space-y-6">
      <section className="space-y-4">
        <div className="space-y-2">
          <div className="inline-flex items-center gap-2 rounded-full bg-sky-100 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-sky-800 dark:bg-sky-900/30 dark:text-sky-300">
            <Settings2 className="size-3.5" aria-hidden />
            Settings Hub
          </div>
          <div>
            <h2 className="text-2xl font-semibold tracking-tight">General Settings</h2>
            <p className="text-sm text-muted-foreground">
              Manage company information, communication settings, and operational defaults.
            </p>
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-4">
          <div className="rounded-xl border bg-background/80 px-4 py-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Company Access
            </p>
            <p className="mt-2 text-lg font-semibold">{canManageCompany ? "Enabled" : "Read only"}</p>
          </div>
          <div className="rounded-xl border bg-background/80 px-4 py-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Email Templates
            </p>
            <p className="mt-2 text-lg font-semibold">{canManageEmailTemplates ? "Enabled" : "Hidden"}</p>
          </div>
          <div className="rounded-xl border bg-background/80 px-4 py-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              SMS Tools
            </p>
            <p className="mt-2 text-lg font-semibold">{canManageSmsPortal ? "Enabled" : "Hidden"}</p>
          </div>
          <div className="rounded-xl border bg-background/80 px-4 py-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Fulfillment
            </p>
            <p className="mt-2 text-lg font-semibold">{canManageFulfillment ? "Enabled" : "Hidden"}</p>
          </div>
        </div>
      </section>

      {canManageCompany ? <SettingsPageData canEdit={true} /> : null}

      {hasAnySettingsAccess ? (
        <section className="space-y-4">
          <div>
            <h3 className="text-lg font-semibold">Quick Access</h3>
            <p className="text-sm text-muted-foreground">
              Jump directly to focused configuration screens.
            </p>
          </div>
          <div className="grid gap-4 xl:grid-cols-2">
            {canManageEmailTemplates ? (
              <Card className="border-border/70 bg-card/95 shadow-sm">
                <CardHeader>
                  <CardTitle>Email Templates</CardTitle>
                  <p className="text-muted-foreground text-sm">
                    Configure notification emails for staff events such as resignations.
                  </p>
                </CardHeader>
                <CardContent>
                  <Button variant="outline" asChild>
                    <Link href="/dashboard/settings/email-templates">
                      <Mail className="size-4" aria-hidden />
                      Manage email templates
                      <ChevronRight className="size-4" aria-hidden />
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            ) : null}

            {canManageSmsPortal ? (
              <Card className="border-border/70 bg-card/95 shadow-sm">
                <CardHeader>
                  <CardTitle>SMS Portal</CardTitle>
                  <p className="text-muted-foreground text-sm">
                    Configure Hutch SMS API credentials and delivery settings.
                  </p>
                </CardHeader>
                <CardContent>
                  <Button variant="outline" asChild>
                    <Link href="/dashboard/settings/sms-portal">
                      <MessageSquare className="size-4" aria-hidden />
                      Configure SMS portal
                      <ChevronRight className="size-4" aria-hidden />
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            ) : null}

            {canManageSmsPortal ? (
              <Card className="border-border/70 bg-card/95 shadow-sm">
                <CardHeader>
                  <CardTitle>SMS Notifications</CardTitle>
                  <p className="text-muted-foreground text-sm">
                    Configure order lifecycle SMS from order received through delivery complete.
                  </p>
                </CardHeader>
                <CardContent>
                  <Button variant="outline" asChild>
                    <Link href="/dashboard/settings/sms-notifications">
                      <MessageSquare className="size-4" aria-hidden />
                      Order SMS notifications
                      <ChevronRight className="size-4" aria-hidden />
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            ) : null}

            {canManageFulfillment ? (
              <Card className="border-border/70 bg-card/95 shadow-sm">
                <CardHeader>
                  <CardTitle>Order Fulfillment</CardTitle>
                  <p className="text-muted-foreground text-sm">
                    Manage samples, free issues, hold reasons, and courier services.
                  </p>
                </CardHeader>
                <CardContent>
                  <Button variant="outline" asChild>
                    <Link href="/dashboard/settings/fulfillment">
                      <Package className="size-4" aria-hidden />
                      Fulfillment settings
                      <ChevronRight className="size-4" aria-hidden />
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            ) : null}
          </div>
        </section>
      ) : null}

      {!hasAnySettingsAccess ? (
        <Card className="border-border/70 bg-card/95 shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck className="size-4 text-muted-foreground" aria-hidden />
              Settings Access Required
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground text-sm">
              Company settings are available only to users with the appropriate permissions.
              Contact your administrator if you need access.
            </p>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
