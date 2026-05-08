import { Stack } from "expo-router";
import { AuthProvider } from "@/src/providers/auth";
import { CompletedDeliveriesProvider } from "@/src/providers/completed-deliveries";
import { SyncProvider } from "@/src/providers/sync";

export default function RootLayout() {
  return (
    <AuthProvider>
      <CompletedDeliveriesProvider>
        <SyncProvider>
          <Stack screenOptions={{ headerShown: false }} />
        </SyncProvider>
      </CompletedDeliveriesProvider>
    </AuthProvider>
  );
}
