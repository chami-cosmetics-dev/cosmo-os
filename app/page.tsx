import { redirect } from "next/navigation";

import { auth0 } from "@/lib/auth0";
import { resolvePostLoginPath } from "@/lib/post-login-path";
import { getCurrentUserContext } from "@/lib/rbac";

export default async function HomePage() {
  const session = await auth0.getSession();

  if (session) {
    const context = await getCurrentUserContext();
    redirect(
      resolvePostLoginPath({
        roleNames: context?.roleNames as string[] | undefined,
        permissionKeys: context?.permissionKeys as string[] | undefined,
      })
    );
  }

  redirect("/login");
}
