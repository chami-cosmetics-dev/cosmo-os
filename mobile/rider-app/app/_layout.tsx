import { Feather } from "@expo/vector-icons";
import { useFonts } from "expo-font";
import { Stack } from "expo-router";
import { ActivityIndicator, View } from "react-native";

import { initMonitoring, wrapRootComponent } from "@/src/lib/monitoring";
import { AuthProvider } from "@/src/providers/auth";
import { CompletedDeliveriesProvider } from "@/src/providers/completed-deliveries";
import { SessionGate } from "@/src/providers/session-gate";
import { SyncProvider } from "@/src/providers/sync";
import { ThemeProvider } from "@/src/providers/theme";
import { colors } from "@/src/theme";

initMonitoring();

function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    ...Feather.font,
  });

  if (!fontsLoaded && !fontError) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.bg }}>
        <ActivityIndicator size="large" color={colors.slate} />
      </View>
    );
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
