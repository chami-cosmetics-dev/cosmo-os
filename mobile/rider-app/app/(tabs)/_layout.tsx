import { Redirect, Tabs } from "expo-router";

import { BootstrapLoading } from "@/src/components/bootstrap-loading";
import { TabBarIcon } from "@/src/components/tab-bar-icon";
import { hasActiveSession, useAuth } from "@/src/providers/auth";
import { useTheme } from "@/src/providers/theme";

export default function TabsLayout() {
  const { colors } = useTheme();
  const { session, bootstrapped } = useAuth();

  if (!bootstrapped) {
    return <BootstrapLoading message="Starting Cosmo Rider…" />;
  }

  if (!hasActiveSession(session)) {
    return <Redirect href="/login" />;
  }

  return (
    <Tabs
      detachInactiveScreens={false}
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
          height: 66,
          paddingTop: 6,
          paddingBottom: 8,
        },
        tabBarActiveTintColor: colors.brand,
        tabBarInactiveTintColor: colors.textSoft,
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: "700",
        },
      }}
    >
      <Tabs.Screen
        name="deliveries"
        options={{
          title: "Route",
          tabBarLabel: "Route",
          tabBarIcon: ({ color, size }) => <TabBarIcon name="navigation" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="completed"
        options={{
          title: "Completed",
          tabBarLabel: "Done",
          tabBarIcon: ({ color, size }) => <TabBarIcon name="check-circle" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="cash"
        options={{
          title: "Cash Handover",
          tabBarLabel: "Cash",
          tabBarIcon: ({ color, size }) => <TabBarIcon name="dollar-sign" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Profile",
          tabBarLabel: "Profile",
          tabBarIcon: ({ color, size }) => <TabBarIcon name="user" color={color} size={size} />,
        }}
      />
    </Tabs>
  );
}
