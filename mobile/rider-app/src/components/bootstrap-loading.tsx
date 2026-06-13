import { ActivityIndicator, StyleSheet, Text, View } from "react-native";

import { colors } from "@/src/theme";

type BootstrapLoadingProps = {
  message?: string;
};

export function BootstrapLoading({ message = "Loading Cosmo Rider…" }: BootstrapLoadingProps) {
  return (
    <View style={styles.page}>
      <ActivityIndicator size="large" color={colors.brand} />
      <Text style={styles.message}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.bg,
    gap: 16,
    paddingHorizontal: 24,
  },
  message: {
    color: colors.textMuted,
    fontSize: 15,
    textAlign: "center",
  },
});
