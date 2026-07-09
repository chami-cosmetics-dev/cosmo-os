import { PrintFormatsSettingsForm } from "@/components/molecules/print-formats-settings-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requirePermission } from "@/lib/rbac";

export const dynamic = "force-dynamic";

export default async function PrintFormatsSettingsPage() {
  const auth = await requirePermission("settings.company");
  if (!auth.ok) {
    return (
      <Card className="overflow-hidden border-border/70 shadow-xs">
        <CardHeader>
          <CardTitle>Print Formats</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">{auth.error}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Print Formats</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage custom HTML templates used for order invoice printing.
        </p>
      </div>
      <PrintFormatsSettingsForm />
    </div>
  );
}
