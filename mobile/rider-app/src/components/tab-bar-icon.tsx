import { Feather } from "@expo/vector-icons";

type TabIconName = "navigation" | "check-circle" | "dollar-sign" | "user";

type TabBarIconProps = {
  name: TabIconName;
  color: string;
  size: number;
};

export function TabBarIcon({ name, color, size }: TabBarIconProps) {
  return <Feather name={name} size={size} color={color} />;
}
