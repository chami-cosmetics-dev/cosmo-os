import { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useTheme } from "@/src/providers/theme";

type CompanyBadgeProps = {
  label: string;
  compact?: boolean;
};

export function CompanyBadge({ label, compact }: CompanyBadgeProps) {
  const { colors, radii } = useTheme();
  const styles = useMemo(() => createStyles(colors, radii, compact), [colors, radii, compact]);

  return (
    <View style={styles.badge}>
      <Text style={styles.text}>{label}</Text>
    </View>
  );
}

function createStyles(
  colors: ReturnType<typeof useTheme>["colors"],
  radii: typeof import("@/src/theme").radii,
  compact?: boolean
) {
  return StyleSheet.create({
    badge: {
      alignSelf: "flex-start",
      backgroundColor: colors.brandSoft,
      borderRadius: radii.pill,
      paddingHorizontal: compact ? 8 : 10,
      paddingVertical: compact ? 4 : 6,
      borderWidth: 1,
      borderColor: colors.border,
    },
    text: {
      color: colors.brand,
      fontWeight: "800",
      fontSize: compact ? 11 : 12,
    },
  });
}
