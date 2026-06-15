import { Stack } from "expo-router";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { BootstrapLoading } from "@/src/components/bootstrap-loading";
import { ErrorBoundary } from "@/src/components/error-boundary";
import { initMonitoring, wrapRootComponent } from "@/src/lib/monitoring";
import { AuthProvider, useAuth } from "@/src/providers/auth";
import { CompletedDeliveriesProvider } from "@/src/providers/completed-deliveries";
import { SessionGate } from "@/src/providers/session-gate";
import { SyncProvider } from "@/src/providers/sync";
import { ThemeProvider } from "@/src/providers/theme";

initMonitoring();

function RootNavigator() {
  const { bootstrapped } = useAuth();

  if (!bootstrapped) {
    return <BootstrapLoading message="Starting Cosmo Rider…" />;
  }

  return (
    <SessionGate>
      <Stack screenOptions={{ headerShown: false }} />
    </SessionGate>
  );
}

function RootLayout() {
  return (
    <ErrorBoundary>
      <SafeAreaProvider>
        <ThemeProvider>
          <AuthProvider>
            <CompletedDeliveriesProvider>
              <SyncProvider>
                <RootNavigator />
              </SyncProvider>
            </CompletedDeliveriesProvider>
          </AuthProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </ErrorBoundary>
  );
}

export default wrapRootComponent(RootLayout);
