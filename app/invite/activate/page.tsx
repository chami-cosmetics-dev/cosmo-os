import { AuthTemplate } from "@/components/templates/auth-template";
import { InviteActivateForm } from "@/components/molecules/invite-activate-form";
import { prisma } from "@/lib/prisma";

type Props = {
  searchParams: Promise<{ token?: string }>;
};

export default async function InviteActivatePage({ searchParams }: Props) {
  const { token } = await searchParams;

  if (!token) {
    return (
      <AuthTemplate
        title="Invalid link"
        description="The activation link is missing. Please use the link from your invitation email."
      >
        <p className="text-muted-foreground text-sm">
          <a href="/invite/request" className="text-primary underline">
            Request a new invite
          </a>
        </p>
      </AuthTemplate>
    );
  }

  const invite = await prisma.invite.findUnique({
    where: { token },
    select: { email: true, expiresAt: true, usedAt: true, isSuperAdmin: true },
  });

  if (!invite) {
    return (
      <AuthTemplate
        title="Invalid link"
        description="This activation link is not valid."
      >
        <p className="text-muted-foreground text-sm">
          <a href="/invite/request" className="text-primary underline">
            Request a new invite
          </a>
        </p>
      </AuthTemplate>
    );
  }

  if (invite.usedAt) {
    return (
      <AuthTemplate
        title="Already activated"
        description="This invite has already been used."
      >
        <p className="text-muted-foreground text-sm">
          <a href="/login" className="text-primary underline">
            Sign in
          </a>
        </p>
      </AuthTemplate>
    );
  }

  if (invite.expiresAt < new Date()) {
    return (
      <AuthTemplate
        title="Link expired"
        description="This activation link has expired. Links are valid for 2 hours."
      >
        <p className="text-muted-foreground text-sm">
          <a href="/invite/request" className="text-primary underline">
            Request a new invite
          </a>
        </p>
      </AuthTemplate>
    );
  }

  return (
    <AuthTemplate
      title="Complete your account"
      description={`Set up your account for ${invite.email}`}
    >
      <InviteActivateForm
        token={token}
        email={invite.email}
        isSuperAdmin={invite.isSuperAdmin}
      />
    </AuthTemplate>
  );
}
