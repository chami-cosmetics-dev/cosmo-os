import { AuthTemplate } from "@/components/templates/auth-template";
import { LoginButton } from "@/components/molecules/login-button";
import { SuperAdminInviteForm } from "@/components/molecules/super-admin-invite-form";
import { prisma } from "@/lib/prisma";

export default async function LoginPage() {
  const userCount = await prisma.user.count();

  if (userCount === 0) {
    return (
      <AuthTemplate
        title="Set up Super Admin"
        description="Enter your email to receive an invitation link. This link expires in 2 hours."
      >
        <SuperAdminInviteForm />
      </AuthTemplate>
    );
  }

  return (
    <AuthTemplate
      title="Sign in"
      description="Sign in to continue to your dashboard"
    >
      <div className="flex flex-col gap-4">
        <LoginButton />
      </div>
    </AuthTemplate>
  );
}
