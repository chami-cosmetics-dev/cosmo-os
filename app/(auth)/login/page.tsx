import { AuthTemplate } from "@/components/templates/auth-template";
import { LoginButton } from "@/components/molecules/login-button";
import { SuperAdminInviteForm } from "@/components/molecules/super-admin-invite-form";
import { prisma } from "@/lib/prisma";
import { ShieldCheck, Sparkles } from "lucide-react";

type Props = {
  searchParams?: Promise<{ activated?: string; email?: string }>;
};

export default async function LoginPage({ searchParams }: Props) {
  const sp = (await searchParams) ?? {};
  const isActivated = sp.activated === "1";
  const activatedEmail = sp.email?.trim() || null;

  const userCount = await prisma.user.count();

  if (userCount === 0) {
    return (
      <AuthTemplate
        title="Set up Super Admin"
        description="Enter your email to receive an invitation link. This link expires in 2 hours."
      >
        <div className="space-y-5">
          <div className="bg-muted/50 rounded-lg border p-4">
            <p className="text-sm font-medium">Before you continue</p>
            <p className="text-muted-foreground mt-1 text-sm">
              Use a company email address you can access right now. We will send
              the secure activation link immediately.
            </p>
          </div>
          <SuperAdminInviteForm />
        </div>
      </AuthTemplate>
    );
  }

  return (
    <AuthTemplate
      title="Sign in"
      description="Sign in to continue to your dashboard"
    >
      <div className="space-y-5">
        {isActivated && (
          <div className="rounded-lg border bg-muted/40 p-4">
            <p className="text-sm font-medium">
              You have successfully Sign-in to Cosmo-Os
            </p>
            {activatedEmail && (
              <p className="text-muted-foreground mt-1 text-sm">
                Continue with <span className="font-medium">{activatedEmail}</span>.
              </p>
            )}
          </div>
        )}
        <div className="grid gap-2">
          <div className="flex items-start gap-2 rounded-lg border p-3">
            <ShieldCheck
              className="text-muted-foreground mt-0.5 h-4 w-4 shrink-0"
              aria-hidden
            />
            <p className="text-muted-foreground text-sm">
              Access is protected with role-based permissions.
            </p>
          </div>
          <div className="flex items-start gap-2 rounded-lg border p-3">
            <Sparkles
              className="text-muted-foreground mt-0.5 h-4 w-4 shrink-0"
              aria-hidden
            />
            <p className="text-muted-foreground text-sm">
              You will be redirected back to your workspace after login.
            </p>
          </div>
        </div>
        <LoginButton />
      </div>
    </AuthTemplate>
  );
}
