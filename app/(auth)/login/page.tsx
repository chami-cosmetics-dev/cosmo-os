import { AuthTemplate } from "@/components/templates/auth-template";
import { LoginButton } from "@/components/molecules/login-button";

export default function LoginPage() {
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
