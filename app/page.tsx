import { redirect } from "next/navigation";

import { auth0 } from "@/lib/auth0";
import { userHasMerchantRole } from "@/lib/merchant-role";
import { getCurrentUserContext } from "@/lib/rbac";

export default async function HomePage() {
  const session = await auth0.getSession();

  if (session) {
    const context = await getCurrentUserContext();
    const roleNames = (context?.roleNames ?? []) as string[];
    if (userHasMerchantRole(roleNames)) {
      redirect("/dashboard/merchant");
    }
    redirect("/dashboard");
  }

  redirect("/login");
}
