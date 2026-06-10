import { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import type { MobileDelivery } from "@/src/types";
import { useTheme } from "@/src/providers/theme";

type SpecialDeliveryBadgesProps = {
  delivery: Pick<MobileDelivery, "deliveryKind" | "requiresOldItemCollection">;
};

export function SpecialDeliveryBadges({ delivery }: SpecialDeliveryBadgesProps) {
  const { colors, radii } = useTheme();
  const styles = useMemo(() => createStyles(colors, radii), [colors, radii]);

  return (
    <View style={styles.row}>
      {delivery.deliveryKind === "rearranged" ? (
        <View style={[styles.badge, styles.rearrangedBadge]}>
          <Text style={styles.badgeText}>Rearranged Order</Text>
        </View>
      ) : null}
      {delivery.deliveryKind === "exchange" ? (
        <View style={[styles.badge, styles.exchangeBadge]}>
          <Text style={styles.badgeText}>Exchange</Text>
        </View>
      ) : null}
      {delivery.requiresOldItemCollection ? (
        <View style={[styles.badge, styles.collectionBadge]}>
          <Text style={styles.badgeText}>Collect old order</Text>
        </View>
      ) : null}
    </View>
  );
}

function createStyles(colors: ReturnType<typeof useTheme>["colors"], radii: typeof import("@/src/theme").radii) {
  return StyleSheet.create({
    row: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
    badge: {
      alignSelf: "flex-start",
      borderRadius: radii.sm,
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderWidth: 1,
    },
    rearrangedBadge: { backgroundColor: "#e0f2fe", borderColor: "#bae6fd" },
    exchangeBadge: { backgroundColor: "#ede9fe", borderColor: "#ddd6fe" },
    collectionBadge: { backgroundColor: "#fef3c7", borderColor: "#fde68a" },
    badgeText: { color: colors.slate, fontSize: 11, fontWeight: "800" },
  });
}
