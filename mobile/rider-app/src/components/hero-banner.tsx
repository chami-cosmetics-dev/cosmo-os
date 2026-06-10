import type { ReactNode } from "react";
import { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useTheme } from "@/src/providers/theme";

type HeroBannerProps = {
  eyebrow: string;
  title: string;
  subtitle?: string;
  children?: ReactNode;
};

export function HeroBanner({ eyebrow, title, subtitle, children }: HeroBannerProps) {
  const { colors, radii, shadows } = useTheme();
  const styles = useMemo(() => createStyles(colors, radii, shadows), [colors, radii, shadows]);

  return (
    <View style={styles.banner}>
      <View style={styles.pill}>
        <Text style={styles.pillText}>{eyebrow}</Text>
      </View>
      <Text style={styles.title}>{title}</Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      {children}
    </View>
  );
}

function createStyles(colors: ReturnType<typeof useTheme>["colors"], radii: typeof import("@/src/theme").radii, shadows: typeof import("@/src/theme").shadows) {
  return StyleSheet.create({
    banner: {
      borderRadius: radii.lg,
      backgroundColor: colors.slate,
      padding: 18,
      borderWidth: 1,
      borderColor: colors.border,
      ...shadows.card,
    },
    pill: {
      alignSelf: "flex-start",
      borderRadius: radii.pill,
      paddingHorizontal: 10,
      paddingVertical: 5,
      backgroundColor: "rgba(255,255,255,0.12)",
      marginBottom: 10,
    },
    pillText: {
      color: colors.white,
      fontSize: 11,
      fontWeight: "700",
      letterSpacing: 0.8,
      textTransform: "uppercase",
    },
    title: {
      color: colors.white,
      fontSize: 26,
      fontWeight: "800",
      letterSpacing: -0.6,
    },
    subtitle: {
      color: "rgba(255,255,255,0.76)",
      marginTop: 8,
      lineHeight: 20,
      fontSize: 14,
    },
  });
}
