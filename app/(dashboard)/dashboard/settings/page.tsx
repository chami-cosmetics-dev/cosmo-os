import Link from "next/link";

import { CompanySettingsForm } from "@/components/molecules/company-settings-form";
import { DepartmentsSettingsForm } from "@/components/molecules/departments-settings-form";
import { DesignationsSettingsForm } from "@/components/molecules/designations-settings-form";
import { LocationsSettingsForm } from "@/components/molecules/locations-settings-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getCurrentUserContext, hasPermission } from "@/lib/rbac";
import { ChevronRight, Mail } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const context = await getCurrentUserContext();
  const canManageCompany = context
    ? hasPermission(context, "settings.company")
    : false;
  const canManageEmailTemplates = context
    ? hasPermission(context, "settings.email_templates")
    : false;

  return (
    <div className="space-y-6">
      {canManageCompany ? (
        <>
          <CompanySettingsForm canEdit={true} />
          <LocationsSettingsForm canEdit={true} />
          <DepartmentsSettingsForm canEdit={true} />
          <DesignationsSettingsForm canEdit={true} />
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
        </>
      ) : null}
      {canManageEmailTemplates && !canManageCompany && (
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
      {!canManageCompany && !canManageEmailTemplates && (
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
