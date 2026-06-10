import { useMemo } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { Feather } from "@expo/vector-icons";

import { formatCompletedDateChipLabel } from "@/src/utils/completed-dates";
import { useTheme } from "@/src/providers/theme";

type DatePickerModalProps = {
  visible: boolean;
  title: string;
  dates: string[];
  selectedDate: string | null;
  overviewLabel?: string;
  onClose: () => void;
  onSelect: (dateKey: string | null) => void;
};

export function DatePickerModal({
  visible,
  title,
  dates,
  selectedDate,
  overviewLabel = "History overview",
  onClose,
  onSelect,
}: DatePickerModalProps) {
  const { colors, radii, shadows } = useTheme();
  const styles = useMemo(() => createStyles(colors, radii, shadows), [colors, radii, shadows]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={() => undefined}>
          <Text style={styles.title}>{title}</Text>
          <Pressable
            style={styles.option}
            onPress={() => {
              onSelect(null);
              onClose();
            }}
          >
            <Text style={styles.optionText}>{overviewLabel}</Text>
            {!selectedDate ? <Feather name="check" size={14} color={colors.brand} /> : null}
          </Pressable>
          {dates.map((value) => (
            <Pressable
              key={value}
              style={styles.option}
              onPress={() => {
                onSelect(value);
                onClose();
              }}
            >
              <Text style={styles.optionText}>{formatCompletedDateChipLabel(value)}</Text>
              {selectedDate === value ? <Feather name="check" size={14} color={colors.brand} /> : null}
            </Pressable>
          ))}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function createStyles(
  colors: ReturnType<typeof useTheme>["colors"],
  radii: typeof import("@/src/theme").radii,
  shadows: typeof import("@/src/theme").shadows
) {
  return StyleSheet.create({
    backdrop: {
      flex: 1,
      backgroundColor: "rgba(15, 23, 42, 0.45)",
      justifyContent: "flex-end",
    },
    sheet: {
      backgroundColor: colors.surface,
      borderTopLeftRadius: radii.lg,
      borderTopRightRadius: radii.lg,
      padding: 20,
      gap: 4,
      borderWidth: 1,
      borderColor: colors.border,
      ...shadows.card,
    },
    title: { fontSize: 18, fontWeight: "800", color: colors.text, marginBottom: 8 },
    option: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingVertical: 14,
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
    optionText: { color: colors.text, fontWeight: "600", fontSize: 15 },
  });
}
