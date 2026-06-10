import { Redirect } from "expo-router";
import { hasActiveSession, useAuth } from "@/src/providers/auth";

export default function IndexScreen() {
  const { session, bootstrapped } = useAuth();

  if (!bootstrapped) {
    return null;
  }

  return <Redirect href={hasActiveSession(session) ? "/(tabs)/deliveries" : "/login"} />;
}
