import { useMemo } from "react";
import { Image, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
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
  /** When set, only these methods are tappable (coupon COD = cash+bank). */
  allowedMethods?: PaymentMethod[] | null;
  collectionKind?: "prepaid" | "partial" | "full" | null;
  orderTotal?: string | null;
  discountCouponCode?: string | null;
  cardSlipUri?: string | null;
  requiresReference: (method: PaymentMethod) => boolean;
  onLinesChange: (lines: PaymentLineDraft[]) => void;
  onCustomerGaveAmountChange: (value: string) => void;
  onPaymentNoteChange: (value: string) => void;
  onPickCardSlip?: () => void;
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
  currency,
  lines,
  customerGaveAmount,
  paymentNote,
  submitting,
  disabled,
  allowedMethods,
  collectionKind,
  orderTotal,
  discountCouponCode,
  cardSlipUri,
  requiresReference,
  onLinesChange,
  onCustomerGaveAmountChange,
  onPaymentNoteChange,
  onPickCardSlip,
  onSubmit,
}: PaymentFormProps) {
  const { colors, radii, shadows } = useTheme();
  const styles = useMemo(() => createStyles(colors, radii, shadows), [colors, radii, shadows]);

  const currencyLabel = currency?.trim() || "LKR";
  const allowed = allowedMethods?.length ? new Set(allowedMethods) : null;
  const methodOptions = METHOD_OPTIONS.filter(([method]) => !allowed || allowed.has(method));
  const linesTotal = lines.reduce((sum, line) => {
    if (line.paymentMethod === "already_paid" && !(Number(line.amount) > 0)) {
      return sum + expectedAmount;
    }
    return sum + (Number(line.amount) || 0);
  }, 0);
  const cashDue = lines
    .filter((line) => line.paymentMethod === "cod")
    .reduce((sum, line) => sum + (Number(line.amount) || 0), 0);
  const gaveRaw = customerGaveAmount.trim();
  const gave = Number(gaveRaw || 0);
  const gaveValid = gaveRaw.length > 0 && Number.isFinite(gave);
  const change = cashDue > 0 && gaveValid ? Math.max(0, gave - cashDue) : null;
  const tenderShort = cashDue > 0.009 && (!gaveValid || gave + 0.001 < cashDue);
  const remaining = Math.max(0, expectedAmount - linesTotal);
  const usedMethods = new Set(lines.map((line) => line.paymentMethod));
  const usesCard = lines.some((line) => line.paymentMethod === "card");
  const canAddLine =
    collectionKind !== "prepaid" &&
    lines.length < 3 &&
    remaining > 0.009 &&
    !usedMethods.has("already_paid") &&
    methodOptions.some(([method]) => !usedMethods.has(method) && method !== "already_paid");

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
      methodOptions.find(([method]) => !usedMethods.has(method) && method !== "already_paid")?.[0] ??
      "cod";
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

  const dueLabel =
    collectionKind === "prepaid"
      ? "Collect from customer"
      : collectionKind === "partial"
        ? "Cash still due"
        : "Amount due";

  return (
    <View style={styles.panel}>
      <Text style={styles.sectionTitle}>Payment</Text>
      <Text style={styles.helperText}>
        {collectionKind === "prepaid"
          ? "Already paid online — confirm with Online / Rs. 0. No door cash."
          : collectionKind === "partial"
            ? "Part paid online. Collect only the cash still due below."
            : discountCouponCode
              ? `Coupon ${discountCouponCode}: cash or bank only (card not allowed).`
              : "Collect the amount due. Use Add method for split payments (e.g. cash + bank)."}
      </Text>

      <View style={styles.dueCard}>
        <Text style={styles.dueLabel}>{dueLabel}</Text>
        <Text style={styles.dueValue}>
          {expectedAmount.toFixed(2)} {currencyLabel}
        </Text>
        {collectionKind === "partial" && orderTotal ? (
          <Text style={styles.helperText}>Order total {orderTotal} {currencyLabel}</Text>
        ) : null}
      </View>

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
            {methodOptions.map(([value, label]) => {
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
              onChangeText={(value) =>
                updateLine(line.id, {
                  reference:
                    line.paymentMethod === "card"
                      ? value.replace(/\D/g, "").slice(0, 4)
                      : value,
                })
              }
              keyboardType={line.paymentMethod === "card" ? "number-pad" : "default"}
              maxLength={line.paymentMethod === "card" ? 4 : undefined}
              placeholder={
                line.paymentMethod === "card" ? "Last 4 digits of card" : "Payment reference"
              }
              placeholderTextColor={colors.textSoft}
            />
          ) : null}
        </View>
      ))}

      {usesCard ? (
        <View style={styles.slipCard}>
          <Text style={styles.lineTitle}>Card payment slip photo</Text>
          <Text style={styles.helperText}>Take a clear photo of the customer payment slip.</Text>
          {cardSlipUri ? (
            <Image source={{ uri: cardSlipUri }} style={styles.slipPreview} resizeMode="cover" />
          ) : null}
          <Pressable style={styles.addButton} onPress={onPickCardSlip}>
            <Text style={styles.addButtonText}>
              {cardSlipUri ? "Retake slip photo" : "Take / choose slip photo"}
            </Text>
          </Pressable>
        </View>
      ) : null}

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
        <View style={styles.tenderCard}>
          <Text style={styles.lineTitle}>Cash change</Text>
          <Text style={styles.cashDueHint}>
            Cash due: {cashDue.toFixed(2)} {currencyLabel}
          </Text>
          <Text style={styles.tenderLabel}>Customer gave</Text>
          <TextInput
            style={styles.input}
            keyboardType="decimal-pad"
            value={customerGaveAmount}
            onChangeText={onCustomerGaveAmountChange}
            placeholder={`e.g. ${(cashDue * 2).toFixed(0)}`}
            placeholderTextColor={colors.textSoft}
          />
          <View style={styles.changeRow}>
            <Text style={styles.changeLabel}>Change to give back</Text>
            <Text style={[styles.changeValue, tenderShort ? styles.changeValueWarn : null]}>
              {change == null ? "—" : `${change.toFixed(2)} ${currencyLabel}`}
            </Text>
          </View>
          {tenderShort ? (
            <Text style={styles.tenderWarn}>Enter cash that covers the cash due before completing.</Text>
          ) : null}
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
    dueCard: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radii.sm,
      padding: 14,
      backgroundColor: colors.brandSoft,
      gap: 4,
    },
    dueLabel: { color: colors.textMuted, fontWeight: "700", fontSize: 12, textTransform: "uppercase" },
    dueValue: { color: colors.text, fontWeight: "800", fontSize: 22 },
    tenderCard: {
      borderWidth: 1,
      borderColor: colors.brand,
      borderRadius: radii.sm,
      padding: 14,
      gap: 8,
      backgroundColor: colors.surfaceMuted,
    },
    cashDueHint: { color: colors.textMuted, fontWeight: "600" },
    tenderLabel: { color: colors.text, fontWeight: "700" },
    changeRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      paddingTop: 4,
    },
    changeLabel: { color: colors.textMuted, fontWeight: "700" },
    changeValue: { color: colors.brand, fontWeight: "800", fontSize: 20 },
    changeValueWarn: { color: colors.danger },
    tenderWarn: { color: colors.danger, fontWeight: "600", fontSize: 13 },
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
    slipCard: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radii.sm,
      padding: 12,
      gap: 8,
      backgroundColor: colors.surfaceMuted,
    },
    slipPreview: {
      width: "100%",
      height: 180,
      borderRadius: radii.sm,
      backgroundColor: colors.border,
    },
    totalHint: { color: colors.textMuted, fontWeight: "600" },
    button: { borderRadius: radii.sm, backgroundColor: colors.brand, padding: 16, alignItems: "center" },
    buttonDisabled: { opacity: 0.7 },
    buttonText: { color: colors.white, fontWeight: "800" },
  });
}
