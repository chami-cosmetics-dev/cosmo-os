import { Tabs, useRouter } from "expo-router";
import { Pressable, Text } from "react-native";
import { useAuth } from "@/src/providers/auth";
import { colors, radii } from "@/src/theme";

export default function TabsLayout() {
  const router = useRouter();
  const { logout } = useAuth();

  return (
    <Tabs
      screenOptions={{
        headerStyle: {
          backgroundColor: colors.bg,
        },
        headerShadowVisible: false,
        headerTitleStyle: {
          color: colors.text,
          fontWeight: "800",
          fontSize: 18,
        },
        sceneStyle: {
          backgroundColor: colors.bg,
        },
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
          height: 74,
          paddingTop: 8,
          paddingBottom: 10,
        },
        tabBarActiveTintColor: colors.brand,
        tabBarInactiveTintColor: colors.textSoft,
        tabBarLabelStyle: {
          fontSize: 12,
          fontWeight: "700",
        },
        headerRight: () => (
          <Pressable
            onPress={async () => {
              await logout();
              router.replace("/login");
            }}
            style={{
              marginRight: 16,
              paddingHorizontal: 12,
              paddingVertical: 8,
              borderRadius: radii.pill,
              backgroundColor: colors.dangerSoft,
            }}
          >
            <Text style={{ color: colors.danger, fontWeight: "700" }}>Logout</Text>
          </Pressable>
        ),
      }}
    >
      <Tabs.Screen name="deliveries" options={{ title: "Route", tabBarLabel: "Route" }} />
      <Tabs.Screen name="completed" options={{ title: "Completed", tabBarLabel: "Done" }} />
      <Tabs.Screen name="cash" options={{ title: "Cash Handover", tabBarLabel: "Cash" }} />
    </Tabs>
  );
}
