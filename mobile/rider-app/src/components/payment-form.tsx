import { useMemo } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import type { PaymentMethod } from "@/src/types";
import { useTheme } from "@/src/providers/theme";

type PaymentFormProps = {
  collectedAmount: string;
  paymentMethod: PaymentMethod;
  paymentReference: string;
  paymentNote: string;
  submitting: boolean;
  disabled: boolean;
  requiresReference: (method: PaymentMethod) => boolean;
  onCollectedAmountChange: (value: string) => void;
  onPaymentMethodChange: (method: PaymentMethod) => void;
  onPaymentReferenceChange: (value: string) => void;
  onPaymentNoteChange: (value: string) => void;
  onSubmit: () => void;
};

export function PaymentForm({
  collectedAmount,
  paymentMethod,
  paymentReference,
  paymentNote,
  submitting,
  disabled,
  requiresReference,
  onCollectedAmountChange,
  onPaymentMethodChange,
  onPaymentReferenceChange,
  onPaymentNoteChange,
  onSubmit,
}: PaymentFormProps) {
  const { colors, radii, shadows } = useTheme();
  const styles = useMemo(() => createStyles(colors, radii, shadows), [colors, radii, shadows]);

  return (
    <View style={styles.panel}>
      <Text style={styles.sectionTitle}>Payment</Text>
      <Text style={styles.helperText}>Collect money from the customer, then save payment and submit delivery.</Text>
      <View style={styles.optionRow}>
        {(
          [
            ["cod", "COD"],
            ["bank_transfer", "Bank"],
            ["card", "Card"],
            ["already_paid", "Online"],
          ] as Array<[PaymentMethod, string]>
        ).map(([value, label]) => (
          <Pressable
            key={value}
            style={[styles.optionChip, paymentMethod === value ? styles.optionChipActive : null]}
            onPress={() => onPaymentMethodChange(value)}
          >
            <Text style={[styles.optionChipText, paymentMethod === value ? styles.optionChipTextActive : null]}>
              {label}
            </Text>
          </Pressable>
        ))}
      </View>
      <TextInput
        style={styles.input}
        keyboardType="decimal-pad"
        value={collectedAmount}
        onChangeText={onCollectedAmountChange}
        placeholder="Collected amount"
        placeholderTextColor={colors.textSoft}
      />
      {requiresReference(paymentMethod) ? (
        <TextInput
          style={styles.input}
          value={paymentReference}
          onChangeText={onPaymentReferenceChange}
          placeholder="Payment reference"
          placeholderTextColor={colors.textSoft}
        />
      ) : null}
      <TextInput
        style={styles.input}
        value={paymentNote}
        onChangeText={onPaymentNoteChange}
        placeholder="Note (optional)"
        placeholderTextColor={colors.textSoft}
      />
      <Pressable
        style={[styles.button, disabled ? styles.buttonDisabled : null]}
        onPress={onSubmit}
        disabled={disabled}
      >
        <Text style={styles.buttonText}>{submitting ? "Submitting..." : "Save payment and complete"}</Text>
      </Pressable>
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
    button: { borderRadius: radii.sm, backgroundColor: colors.brand, padding: 16, alignItems: "center" },
    buttonDisabled: { opacity: 0.7 },
    buttonText: { color: colors.white, fontWeight: "800" },
  });
}
