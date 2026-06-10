import type { ReactNode } from "react";
import { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useTheme } from "@/src/providers/theme";

type HeroBannerProps = {
  eyebrow: string;
  title: string;
  subtitle?: string;
  compact?: boolean;
  children?: ReactNode;
};

export function HeroBanner({ eyebrow, title, subtitle, compact, children }: HeroBannerProps) {
  const { colors, radii, shadows } = useTheme();
  const styles = useMemo(() => createStyles(colors, radii, shadows, compact), [colors, radii, shadows, compact]);

  return (
    <View style={styles.banner}>
      <View style={styles.headerRow}>
        <View style={styles.headerCopy}>
          <View style={styles.pill}>
            <Text style={styles.pillText}>{eyebrow}</Text>
          </View>
          <Text style={styles.title}>{title}</Text>
          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
        </View>
      </View>
      {children}
    </View>
  );
}

function createStyles(
  colors: ReturnType<typeof useTheme>["colors"],
  radii: typeof import("@/src/theme").radii,
  shadows: typeof import("@/src/theme").shadows,
  compact?: boolean
) {
  return StyleSheet.create({
    banner: {
      borderRadius: compact ? radii.md : radii.lg,
      backgroundColor: colors.heroBg,
      padding: compact ? 12 : 18,
      borderWidth: 1,
      borderColor: colors.border,
      ...shadows.card,
    },
    headerRow: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between" },
    headerCopy: { flex: 1, gap: compact ? 4 : 0 },
    pill: {
      alignSelf: "flex-start",
      borderRadius: radii.pill,
      paddingHorizontal: compact ? 8 : 10,
      paddingVertical: compact ? 3 : 5,
      backgroundColor: "rgba(255,255,255,0.12)",
      marginBottom: compact ? 4 : 10,
    },
    pillText: {
      color: colors.white,
      fontSize: compact ? 10 : 11,
      fontWeight: "700",
      letterSpacing: 0.6,
      textTransform: "uppercase",
    },
    title: {
      color: colors.white,
      fontSize: compact ? 18 : 26,
      fontWeight: "800",
      letterSpacing: compact ? -0.3 : -0.6,
    },
    subtitle: {
      color: "rgba(255,255,255,0.76)",
      marginTop: compact ? 2 : 8,
      lineHeight: compact ? 18 : 20,
      fontSize: compact ? 12 : 14,
    },
  });
}
