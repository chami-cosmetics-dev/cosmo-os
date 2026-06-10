import { Stack } from "expo-router";
import { AuthProvider } from "@/src/providers/auth";
import { CompletedDeliveriesProvider } from "@/src/providers/completed-deliveries";
import { SessionGate } from "@/src/providers/session-gate";
import { SyncProvider } from "@/src/providers/sync";
import { ThemeProvider } from "@/src/providers/theme";

export default function RootLayout() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <CompletedDeliveriesProvider>
          <SyncProvider>
            <SessionGate>
              <Stack screenOptions={{ headerShown: false }} />
            </SessionGate>
          </SyncProvider>
        </CompletedDeliveriesProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
