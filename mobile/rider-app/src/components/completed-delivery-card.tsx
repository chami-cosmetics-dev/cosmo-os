import { useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import type { CompletedListItem } from "@/src/hooks/use-completed-deliveries-list";
import { useTheme } from "@/src/providers/theme";

type CompletedDeliveryCardProps = {
  delivery: CompletedListItem;
};

export function CompletedDeliveryCard({ delivery }: CompletedDeliveryCardProps) {
  const { colors, radii, shadows } = useTheme();
  const styles = useMemo(() => createStyles(colors, radii, shadows), [colors, radii, shadows]);

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View style={styles.titleWrap}>
          <Text style={styles.title}>{delivery.orderLabel}</Text>
          <Text style={styles.meta}>{delivery.customerName ?? "Unknown customer"}</Text>
        </View>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>Done</Text>
        </View>
      </View>
      <Text style={styles.meta}>{delivery.companyLocation?.name ?? "Unknown location"}</Text>
      <View style={styles.footer}>
        <Text style={styles.amount}>{delivery.amount}</Text>
        <Text style={styles.status}>
          {delivery.completedAt ? new Date(delivery.completedAt).toLocaleString("en-LK") : "Just now"}
        </Text>
      </View>
    </View>
  );
}

function createStyles(
  colors: ReturnType<typeof useTheme>["colors"],
  radii: typeof import("@/src/theme").radii,
  shadows: typeof import("@/src/theme").shadows
) {
  return StyleSheet.create({
    card: {
      backgroundColor: colors.surface,
      borderRadius: radii.md,
      padding: 18,
      borderWidth: 1,
      borderColor: colors.border,
      gap: 10,
      ...shadows.card,
    },
    header: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 12 },
    titleWrap: { flex: 1, gap: 4 },
    title: { fontSize: 18, fontWeight: "800", color: colors.text },
    meta: { color: colors.textMuted, lineHeight: 20 },
    badge: {
      backgroundColor: colors.surfaceMuted,
      borderRadius: radii.sm,
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderWidth: 1,
      borderColor: colors.border,
    },
    badgeText: { color: colors.slate, fontSize: 12, fontWeight: "800" },
    footer: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 12 },
    amount: { fontSize: 22, fontWeight: "800", color: colors.slate },
    status: { color: colors.textSoft, textAlign: "right", flexShrink: 1 },
  });
}
