import { Redirect } from "expo-router";
import { useAuth } from "@/src/providers/auth";

export default function IndexScreen() {
  const { session, bootstrapped } = useAuth();

  if (!bootstrapped) {
    return null;
  }

  return <Redirect href={session ? "/(tabs)/deliveries" : "/login"} />;
}
