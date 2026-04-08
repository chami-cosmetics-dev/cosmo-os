import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type PermissionDeniedCardProps = {
  title?: string;
  message?: string;
};

export function PermissionDeniedCard({
  title = "Access restricted",
  message = "This page is available to users with the appropriate permissions. Contact your administrator to request access.",
}: PermissionDeniedCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-muted-foreground text-sm">{message}</p>
      </CardContent>
    </Card>
  );
}

