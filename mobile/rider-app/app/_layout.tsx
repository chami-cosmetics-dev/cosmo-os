import { Feather } from "@expo/vector-icons";
import { useFonts } from "expo-font";
import { Stack } from "expo-router";
import { useEffect, useState } from "react";

import { BootstrapLoading } from "@/src/components/bootstrap-loading";
import { initMonitoring, wrapRootComponent } from "@/src/lib/monitoring";
import { AuthProvider } from "@/src/providers/auth";
import { CompletedDeliveriesProvider } from "@/src/providers/completed-deliveries";
import { SessionGate } from "@/src/providers/session-gate";
import { SyncProvider } from "@/src/providers/sync";
import { ThemeProvider } from "@/src/providers/theme";

initMonitoring();

function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    ...Feather.font,
  });
  const [fontTimedOut, setFontTimedOut] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setFontTimedOut(true), 4000);
    return () => clearTimeout(timer);
  }, []);

  const fontsReady = fontsLoaded || fontError != null || fontTimedOut;

  if (!fontsReady) {
    return <BootstrapLoading message="Starting Cosmo Rider…" />;
  }

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

export default wrapRootComponent(RootLayout);
