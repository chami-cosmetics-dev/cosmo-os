import { Redirect } from "expo-router";
import { BootstrapLoading } from "@/src/components/bootstrap-loading";
import { hasActiveSession, useAuth } from "@/src/providers/auth";

export default function IndexScreen() {
  const { session, bootstrapped } = useAuth();

  if (!bootstrapped) {
    return <BootstrapLoading />;
  }

  return <Redirect href={hasActiveSession(session) ? "/(tabs)/deliveries" : "/login"} />;
}
