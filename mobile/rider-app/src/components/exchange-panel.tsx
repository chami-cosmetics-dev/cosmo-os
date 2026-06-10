import { useMemo } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import type { MobileDeliveryDetail, OldItemCollectionStatus, PaymentMethod } from "@/src/types";
import { useTheme } from "@/src/providers/theme";

type ExchangePanelProps = {
  delivery: MobileDeliveryDetail;
  oldItemCollectionStatus: OldItemCollectionStatus;
  oldItemCollectionRemark: string;
  onStatusChange: (status: OldItemCollectionStatus) => void;
  onRemarkChange: (remark: string) => void;
};

export function ExchangePanel({
  delivery,
  oldItemCollectionStatus,
  oldItemCollectionRemark,
  onStatusChange,
  onRemarkChange,
}: ExchangePanelProps) {
  const { colors, radii, shadows } = useTheme();
  const styles = useMemo(() => createStyles(colors, radii, shadows), [colors, radii, shadows]);
  const paymentDifference = Number(delivery.exchangePaymentDifference ?? 0);

  return (
    <View style={styles.panel}>
      <Text style={styles.sectionTitle}>Exchange instructions</Text>
      <Text style={styles.helperText}>Collect old order: {delivery.oldOrderLabel ?? "Original order"}</Text>
      <Text style={styles.helperText}>
        Replacement: {delivery.replacementOrderLabel ?? delivery.orderLabel}
      </Text>
      <View style={styles.moneyBox}>
        <Text style={styles.moneyTitle}>
          {paymentDifference > 0
            ? `Collect extra Rs. ${paymentDifference.toFixed(2)}`
            : paymentDifference < 0
              ? `Give change/refund Rs. ${Math.abs(paymentDifference).toFixed(2)}`
              : "No payment difference"}
        </Text>
        <Text style={styles.helperText}>This is separate from normal delivery payment.</Text>
      </View>
      {delivery.requiresOldItemCollection ? (
        <>
          <Text style={styles.helperText}>Old order collection status</Text>
          <View style={styles.optionRow}>
            {(
              [
                ["collected", "Collected"],
                ["not_collected", "Not collected"],
              ] as Array<[OldItemCollectionStatus, string]>
            ).map(([value, label]) => (
              <Pressable
                key={value}
                style={[styles.optionChip, oldItemCollectionStatus === value ? styles.optionChipActive : null]}
                onPress={() => onStatusChange(value)}
              >
                <Text
                  style={[styles.optionChipText, oldItemCollectionStatus === value ? styles.optionChipTextActive : null]}
                >
                  {label}
                </Text>
              </Pressable>
            ))}
          </View>
          {oldItemCollectionStatus === "not_collected" ? (
            <TextInput
              style={styles.input}
              value={oldItemCollectionRemark}
              onChangeText={onRemarkChange}
              placeholder="Why was the old order not collected?"
              placeholderTextColor={colors.textSoft}
            />
          ) : null}
        </>
      ) : null}
    </View>
  );
}

function createStyles(
  colors: ReturnType<typeof useTheme>["colors"],
  radii: typeof import("@/src/theme").radii,
  shadows: typeof import("@/src/theme").shadows
) {
  return StyleSheet.create({
    panel: {
      backgroundColor: colors.surface,
      borderRadius: radii.md,
      padding: 18,
      borderWidth: 1,
      borderColor: colors.border,
      gap: 10,
      ...shadows.card,
    },
    sectionTitle: { fontSize: 17, fontWeight: "800", color: colors.text },
    helperText: { color: colors.textMuted, lineHeight: 20 },
    moneyBox: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radii.sm,
      backgroundColor: colors.surfaceMuted,
      padding: 12,
      gap: 4,
    },
    moneyTitle: { color: colors.emphasis, fontWeight: "800", fontSize: 16 },
    optionRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
    optionChip: {
      borderWidth: 1,
      borderColor: colors.borderStrong,
      borderRadius: radii.pill,
      paddingHorizontal: 14,
      paddingVertical: 10,
      backgroundColor: colors.surfaceMuted,
    },
    optionChipActive: { backgroundColor: colors.brand, borderColor: colors.brand },
    optionChipText: { color: colors.textMuted, fontWeight: "700" },
    optionChipTextActive: { color: colors.white },
    input: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radii.sm,
      padding: 14,
      backgroundColor: colors.surfaceMuted,
      color: colors.text,
    },
  });
}
