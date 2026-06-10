import { Tabs } from "expo-router";

import { TabBarIcon } from "@/src/components/tab-bar-icon";
import { useTheme } from "@/src/providers/theme";

export default function TabsLayout() {
  const { colors } = useTheme();

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
