import { RegisterPortalForm } from "@/app/register/[token]/register-portal-form";

export const dynamic = "force-dynamic";

export default async function RegisterPortalPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return <RegisterPortalForm token={token} />;
}
