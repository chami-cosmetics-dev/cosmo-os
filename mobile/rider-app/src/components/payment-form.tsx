import { useMemo } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import type { PaymentMethod } from "@/src/types";
import { useTheme } from "@/src/providers/theme";
import { getPaymentMethodLabel } from "@/src/utils/delivery";

export type PaymentLineDraft = {
  id: string;
  paymentMethod: PaymentMethod;
  amount: string;
  reference: string;
};

type PaymentFormProps = {
  expectedAmount: number;
  currency?: string | null;
  lines: PaymentLineDraft[];
  customerGaveAmount: string;
  paymentNote: string;
  submitting: boolean;
  disabled: boolean;
  requiresReference: (method: PaymentMethod) => boolean;
  onLinesChange: (lines: PaymentLineDraft[]) => void;
  onCustomerGaveAmountChange: (value: string) => void;
  onPaymentNoteChange: (value: string) => void;
  onSubmit: () => void;
};

const METHOD_OPTIONS: Array<[PaymentMethod, string]> = [
  ["cod", "COD"],
  ["bank_transfer", "Bank"],
  ["card", "Card"],
  ["already_paid", "Online"],
];

function nextLineId() {
  return `line-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export function PaymentForm({
  expectedAmount,
  lines,
  customerGaveAmount,
  paymentNote,
  submitting,
  disabled,
  requiresReference,
  onLinesChange,
  onCustomerGaveAmountChange,
  onPaymentNoteChange,
  onSubmit,
}: PaymentFormProps) {
  const { colors, radii, shadows } = useTheme();
  const styles = useMemo(() => createStyles(colors, radii, shadows), [colors, radii, shadows]);

  const linesTotal = lines.reduce((sum, line) => sum + (Number(line.amount) || 0), 0);
  const cashDue = lines
    .filter((line) => line.paymentMethod === "cod")
    .reduce((sum, line) => sum + (Number(line.amount) || 0), 0);
  const gave = Number(customerGaveAmount || 0);
  const change = cashDue > 0 ? Math.max(0, gave - cashDue) : 0;
  const remaining = Math.max(0, expectedAmount - linesTotal);
  const usedMethods = new Set(lines.map((line) => line.paymentMethod));
  const canAddLine =
    lines.length < 3 &&
    remaining > 0.009 &&
    !usedMethods.has("already_paid") &&
    METHOD_OPTIONS.some(([method]) => !usedMethods.has(method) && method !== "already_paid");

  function updateLine(id: string, patch: Partial<PaymentLineDraft>) {
    onLinesChange(lines.map((line) => (line.id === id ? { ...line, ...patch } : line)));
  }

  function removeLine(id: string) {
    if (lines.length <= 1) return;
    onLinesChange(lines.filter((line) => line.id !== id));
  }

  function addLine() {
    if (!canAddLine) return;
    const nextMethod =
      METHOD_OPTIONS.find(([method]) => !usedMethods.has(method) && method !== "already_paid")?.[0] ??
      "card";
    onLinesChange([
      ...lines,
      {
        id: nextLineId(),
        paymentMethod: nextMethod,
        amount: remaining > 0 ? remaining.toFixed(2) : "",
        reference: "",
      },
    ]);
  }

  return (
    <View style={styles.panel}>
      <Text style={styles.sectionTitle}>Payment</Text>
      <Text style={styles.helperText}>
        Collect the full order amount. Use Add method for split payments (e.g. cash + card).
      </Text>

      {lines.map((line, index) => (
        <View key={line.id} style={styles.lineCard}>
          <View style={styles.lineHeader}>
            <Text style={styles.lineTitle}>
              {lines.length > 1 ? `Part ${index + 1}` : "Collection"}
            </Text>
            {lines.length > 1 ? (
              <Pressable onPress={() => removeLine(line.id)}>
                <Text style={styles.removeText}>Remove</Text>
              </Pressable>
            ) : null}
          </View>

          <View style={styles.optionRow}>
            {METHOD_OPTIONS.map(([value, label]) => {
              const takenByOther = lines.some(
                (other) => other.id !== line.id && other.paymentMethod === value
              );
              const disabledOption =
                takenByOther ||
                (lines.length > 1 && value === "already_paid") ||
                (value === "already_paid" && lines.length > 1);
              return (
                <Pressable
                  key={value}
                  style={[
                    styles.optionChip,
                    line.paymentMethod === value ? styles.optionChipActive : null,
                    disabledOption ? styles.optionChipDisabled : null,
                  ]}
                  disabled={disabledOption}
                  onPress={() => updateLine(line.id, { paymentMethod: value, reference: "" })}
                >
                  <Text
                    style={[
                      styles.optionChipText,
                      line.paymentMethod === value ? styles.optionChipTextActive : null,
                    ]}
                  >
                    {label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <TextInput
            style={styles.input}
            keyboardType="decimal-pad"
            value={line.amount}
            onChangeText={(value) => updateLine(line.id, { amount: value })}
            placeholder={`${getPaymentMethodLabel(line.paymentMethod)} amount`}
            placeholderTextColor={colors.textSoft}
          />

          {requiresReference(line.paymentMethod) ? (
            <TextInput
              style={styles.input}
              value={line.reference}
              onChangeText={(value) => updateLine(line.id, { reference: value })}
              placeholder="Payment reference"
              placeholderTextColor={colors.textSoft}
            />
          ) : null}
        </View>
      ))}

      {canAddLine ? (
        <Pressable style={styles.addButton} onPress={addLine}>
          <Text style={styles.addButtonText}>+ Add method (split payment)</Text>
        </Pressable>
      ) : null}

      <Text style={styles.totalHint}>
        Entered {linesTotal.toFixed(2)} / {expectedAmount.toFixed(2)}
        {remaining > 0.009 ? ` · remaining ${remaining.toFixed(2)}` : ""}
      </Text>

      {cashDue > 0.009 ? (
        <View style={styles.lineCard}>
          <Text style={styles.lineTitle}>Customer gave (cash)</Text>
          <TextInput
            style={styles.input}
            keyboardType="decimal-pad"
            value={customerGaveAmount}
            onChangeText={onCustomerGaveAmountChange}
            placeholder={`Cash due ${cashDue.toFixed(2)}`}
            placeholderTextColor={colors.textSoft}
          />
          <Text style={styles.totalHint}>
            Balance (change): {change.toFixed(2)}
            {gave + 0.001 < cashDue ? " · need more cash" : ""}
          </Text>
        </View>
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

export function createDefaultPaymentLine(amount: string, method: PaymentMethod = "cod"): PaymentLineDraft {
  return {
    id: nextLineId(),
    paymentMethod: method,
    amount,
    reference: "",
  };
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
    lineCard: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radii.sm,
      padding: 12,
      gap: 8,
      backgroundColor: colors.surfaceMuted,
    },
    lineHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
    lineTitle: { fontWeight: "700", color: colors.text },
    removeText: { color: colors.danger, fontWeight: "700" },
    optionRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
    optionChip: {
      borderWidth: 1,
      borderColor: colors.borderStrong,
      borderRadius: radii.pill,
      paddingHorizontal: 14,
      paddingVertical: 10,
      backgroundColor: colors.surface,
    },
    optionChipActive: { backgroundColor: colors.brand, borderColor: colors.brand },
    optionChipDisabled: { opacity: 0.35 },
    optionChipText: { color: colors.textMuted, fontWeight: "700" },
    optionChipTextActive: { color: colors.white },
    input: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radii.sm,
      padding: 14,
      backgroundColor: colors.surface,
      color: colors.text,
    },
    addButton: {
      borderWidth: 1,
      borderColor: colors.brand,
      borderRadius: radii.sm,
      padding: 12,
      alignItems: "center",
    },
    addButtonText: { color: colors.brand, fontWeight: "700" },
    totalHint: { color: colors.textMuted, fontWeight: "600" },
    button: { borderRadius: radii.sm, backgroundColor: colors.brand, padding: 16, alignItems: "center" },
    buttonDisabled: { opacity: 0.7 },
    buttonText: { color: colors.white, fontWeight: "800" },
  });
}
