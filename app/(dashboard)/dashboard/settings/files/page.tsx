import { FilesSettingsForm } from "@/components/molecules/files-settings-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requirePermission } from "@/lib/rbac";

export const dynamic = "force-dynamic";

export default async function FilesSettingsPage() {
  const auth = await requirePermission("settings.company");
  if (!auth.ok) {
    return (
      <Card className="overflow-hidden border-border/70 shadow-xs">
        <CardHeader>
          <CardTitle>Files</CardTitle>
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
        <h1 className="text-2xl font-semibold tracking-tight">Files</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Upload and manage files that can be referenced by custom print formats.
        </p>
      </div>
      <FilesSettingsForm />
    </div>
  );
}
