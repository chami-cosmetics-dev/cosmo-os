import { Feather } from "@expo/vector-icons";
import { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";

import { CompanyBadge } from "@/src/components/company-badge";
import type { CompletedListItem } from "@/src/hooks/use-completed-deliveries-list";
import { useSync } from "@/src/providers/sync";
import { useTheme } from "@/src/providers/theme";
import { getAddressText } from "@/src/utils/contact";
import { formatCompletedTime } from "@/src/utils/completed-dates";
import { formatMoney } from "@/src/utils/money";

type CompletedDeliveryCardProps = {
  delivery: CompletedListItem;
};

export function CompletedDeliveryCard({ delivery }: CompletedDeliveryCardProps) {
  const { queuedActions } = useSync();
  const { colors, radii, shadows, resolvedMode } = useTheme();
  const styles = useMemo(() => createStyles(colors, radii, shadows), [colors, radii, shadows]);
  const isDarkMode = resolvedMode === "dark";
  const isNotSynced = queuedActions.some((action) => action.endpoint.includes(delivery.id));

  return (
    <View style={styles.card}>
      <View style={styles.icon}>
        <Feather
          name={
            delivery.expectedPaymentMethod === "cod"
              ? "truck"
              : delivery.expectedPaymentMethod === "already_paid"
                ? "package"
                : "shopping-bag"
          }
          size={13}
          color={isDarkMode ? "#dbe6f7" : colors.slate}
        />
      </View>
      <View style={styles.body}>
        <CompanyBadge label={delivery.companyLabel} compact />
        <View style={styles.top}>
          <Text style={styles.customer}>{delivery.customerName ?? "Unknown customer"}</Text>
          <Text style={styles.amount}>{formatMoney(delivery.amount, delivery.currency)}</Text>
        </View>
        <Text style={styles.location} numberOfLines={1}>
          {getAddressText(delivery)}
        </Text>
        <View style={styles.metaRow}>
          <Text style={styles.time}>{formatCompletedTime(delivery.completedAt)}</Text>
          <View style={styles.methodBadge}>
            <Text style={styles.methodBadgeText}>
              {delivery.expectedPaymentMethod === "cod" ? "COD" : "Done"}
            </Text>
          </View>
          {isNotSynced ? <Text style={styles.unsynced}>Sync</Text> : null}
        </View>
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
      padding: 16,
      borderWidth: 1,
      borderColor: colors.border,
      flexDirection: "row",
      gap: 12,
      ...shadows.card,
    },
    icon: {
      width: 34,
      height: 34,
      borderRadius: 17,
      backgroundColor: colors.surfaceMuted,
      alignItems: "center",
      justifyContent: "center",
      marginTop: 4,
    },
    body: { flex: 1, gap: 6 },
    top: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 12 },
    customer: { flex: 1, fontSize: 16, fontWeight: "800", color: colors.text },
    amount: { fontSize: 16, fontWeight: "800", color: colors.emphasis },
    location: { color: colors.textMuted, fontSize: 13 },
    metaRow: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
    time: { color: colors.textSoft, fontSize: 12, fontWeight: "600" },
    methodBadge: {
      borderRadius: radii.pill,
      paddingHorizontal: 8,
      paddingVertical: 4,
      backgroundColor: colors.brandSoft,
    },
    methodBadgeText: { color: colors.brand, fontWeight: "800", fontSize: 11 },
    unsynced: { color: colors.danger, fontWeight: "700", fontSize: 11 },
  });
}
