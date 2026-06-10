import { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import type { ApiMobileDelivery } from "@/src/types";
import { useTheme } from "@/src/providers/theme";

type SpecialDeliveryBadgesProps = {
  delivery: Pick<ApiMobileDelivery, "deliveryKind" | "requiresOldItemCollection">;
};

export function SpecialDeliveryBadges({ delivery }: SpecialDeliveryBadgesProps) {
  const { colors, radii } = useTheme();
  const styles = useMemo(() => createStyles(colors, radii), [colors, radii]);

  return (
    <View style={styles.row}>
      {delivery.deliveryKind === "rearranged" ? (
        <View style={[styles.badge, styles.rearrangedBadge]}>
          <Text style={[styles.badgeText, styles.rearrangedText]}>Rearranged Order</Text>
        </View>
      ) : null}
      {delivery.deliveryKind === "exchange" ? (
        <View style={[styles.badge, styles.exchangeBadge]}>
          <Text style={[styles.badgeText, styles.exchangeText]}>Exchange</Text>
        </View>
      ) : null}
      {delivery.requiresOldItemCollection ? (
        <View style={[styles.badge, styles.collectionBadge]}>
          <Text style={[styles.badgeText, styles.collectionText]}>Collect old order</Text>
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
      paddingHorizontal: 7,
      paddingVertical: 3,
      borderWidth: 1,
    },
    rearrangedBadge: {
      backgroundColor: colors.badgeRearrangedBg,
      borderColor: colors.badgeRearrangedBorder,
    },
    exchangeBadge: {
      backgroundColor: colors.badgeExchangeBg,
      borderColor: colors.badgeExchangeBorder,
    },
    collectionBadge: {
      backgroundColor: colors.badgeCollectionBg,
      borderColor: colors.badgeCollectionBorder,
    },
    badgeText: { fontSize: 10, fontWeight: "800" },
    rearrangedText: { color: colors.accent },
    exchangeText: { color: colors.brand },
    collectionText: { color: colors.danger },
  });
}
