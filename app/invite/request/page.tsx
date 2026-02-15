import Link from "next/link";

import { AuthTemplate } from "@/components/templates/auth-template";
import { ResendInviteForm } from "@/components/molecules/resend-invite-form";

export default function InviteRequestPage() {
  return (
    <AuthTemplate
      title="Request invite"
      description="Enter your email to receive a new invitation link."
    >
      <div className="space-y-4">
        <ResendInviteForm />
        <p className="text-muted-foreground text-center text-sm">
          <Link href="/login" className="text-primary underline">
            Back to login
          </Link>
        </p>
      </div>
    </AuthTemplate>
  );
}
