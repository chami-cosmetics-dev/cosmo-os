import { Stack } from "expo-router";
import { AuthProvider } from "@/src/providers/auth";
import { CompletedDeliveriesProvider } from "@/src/providers/completed-deliveries";
import { SessionGate } from "@/src/providers/session-gate";
import { SyncProvider } from "@/src/providers/sync";

export default function RootLayout() {
  return (
    <AuthProvider>
      <CompletedDeliveriesProvider>
        <SyncProvider>
          <SessionGate>
            <Stack screenOptions={{ headerShown: false }} />
          </SessionGate>
        </SyncProvider>
      </CompletedDeliveriesProvider>
    </AuthProvider>
  );
}
