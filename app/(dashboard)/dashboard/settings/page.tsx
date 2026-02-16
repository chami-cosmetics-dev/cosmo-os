import Link from "next/link";

import { SettingsPageData } from "@/components/organisms/settings-page-data";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getCurrentUserContext, hasPermission } from "@/lib/rbac";
import { ChevronRight, Mail, MessageSquare } from "lucide-react";

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

  return (
    <div className="space-y-6">
      {canManageCompany ? (
        <>
          <SettingsPageData canEdit={true} />
          {canManageEmailTemplates && (
            <Card>
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
          )}
          {canManageSmsPortal && (
            <Card>
              <CardHeader>
                <CardTitle>SMS Portal</CardTitle>
                <p className="text-muted-foreground text-sm">
                  Configure Hutch SMS API credentials for sending SMS. Sent messages are counted for tracking.
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
          )}
        </>
      ) : null}
      {(canManageEmailTemplates || canManageSmsPortal) && !canManageCompany && (
        <>
          {canManageEmailTemplates && (
            <Card>
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
          )}
          {canManageSmsPortal && (
            <Card>
              <CardHeader>
                <CardTitle>SMS Portal</CardTitle>
                <p className="text-muted-foreground text-sm">
                  Configure Hutch SMS API credentials for sending SMS. Sent messages are counted for tracking.
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
          )}
        </>
      )}
      {!canManageCompany && !canManageEmailTemplates && !canManageSmsPortal && (
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
