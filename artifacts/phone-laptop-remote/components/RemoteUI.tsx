import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  RefreshControlProps,
  ScrollView,
  StyleProp,
  StyleSheet,
  Text,
  TextInput,
  View,
  ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';

type ScreenProps = {
  children: React.ReactNode;
  scroll?: boolean;
  contentStyle?: StyleProp<ViewStyle>;
  /** Space reserved for the tab bar. Stack screens can use a smaller value. */
  bottomPadding?: number;
  refreshControl?: React.ReactElement<RefreshControlProps>;
};

export function Screen({ children, scroll = true, contentStyle, bottomPadding = 26, refreshControl }: ScreenProps) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const paddingTop = Platform.OS === 'web' ? Math.max(insets.top, 44) : insets.top;
  const style = [
    styles.screenContent,
    { paddingTop: paddingTop + 16, paddingBottom: Math.max(insets.bottom, Platform.OS === 'web' ? 20 : 12) + bottomPadding },
    contentStyle,
  ];
  return scroll ? (
    <ScrollView
      style={[styles.screen, { backgroundColor: colors.background }]}
      contentContainerStyle={style}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      refreshControl={refreshControl}
    >
      {children}
    </ScrollView>
  ) : (
    <View style={[styles.screen, { backgroundColor: colors.background }, style]}>{children}</View>
  );
}

export function Header({
  title,
  subtitle,
  back = false,
  right,
  eyebrow = 'LAPTOP REMOTE',
}: {
  title: string;
  subtitle?: string;
  back?: boolean;
  right?: React.ReactNode;
  eyebrow?: string | null;
}) {
  const colors = useColors();
  const router = useRouter();
  return (
    <View style={styles.header}>
      <View style={styles.headerLeft}>
        {back ? <IconButton icon="arrow-left" label="Go back" onPress={() => router.back()} /> : null}
        <View style={styles.headerCopy}>
          {eyebrow ? <Text style={[styles.eyebrow, { color: colors.primary }]}>{eyebrow}</Text> : null}
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>{title}</Text>
          {subtitle ? <Text style={[styles.headerSubtitle, { color: colors.mutedForeground }]}>{subtitle}</Text> : null}
        </View>
      </View>
      {right ? <View style={styles.headerRight}>{right}</View> : null}
    </View>
  );
}

export function IconButton({
  icon,
  label,
  onPress,
  tone = 'muted',
  disabled = false,
  busy = false,
}: {
  icon: keyof typeof Feather.glyphMap;
  label: string;
  onPress: () => void;
  tone?: 'muted' | 'primary';
  disabled?: boolean;
  busy?: boolean;
}) {
  const colors = useColors();
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      testID={`icon-${label}`}
      disabled={disabled || busy}
      onPress={onPress}
      style={({ pressed }) => [
        styles.iconButton,
        {
          backgroundColor: tone === 'primary' ? colors.accent : colors.surfaceRaised,
          borderColor: tone === 'primary' ? colors.primary : colors.border,
          opacity: disabled ? 0.45 : pressed ? 0.65 : 1,
        },
      ]}
    >
      {busy
        ? <ActivityIndicator size="small" color={tone === 'primary' ? colors.primary : colors.secondaryForeground} />
        : <Feather name={icon} size={18} color={tone === 'primary' ? colors.primary : colors.secondaryForeground} />}
    </Pressable>
  );
}

export function Surface({
  children,
  style,
  onPress,
  accessibilityLabel,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
  accessibilityLabel?: string;
}) {
  const colors = useColors();
  const content = <View style={[styles.surface, { backgroundColor: colors.card, borderColor: colors.border }, style]}>{children}</View>;
  return onPress ? (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      style={({ pressed }) => ({ opacity: pressed ? 0.82 : 1 })}
    >
      {content}
    </Pressable>
  ) : content;
}

export function StatusPill({ status, label }: { status: 'offline' | 'online' | 'connecting'; label?: string }) {
  const colors = useColors();
  const tone = status === 'online' ? colors.success : status === 'connecting' ? colors.warning : colors.offline;
  const fallback = status === 'online' ? 'ONLINE' : status === 'connecting' ? 'CHECKING' : 'OFFLINE';
  return (
    <View style={[styles.statusPill, { backgroundColor: `${tone}18`, borderColor: `${tone}55` }]}>
      <View style={[styles.statusDot, { backgroundColor: tone }]} />
      <Text style={[styles.statusText, { color: tone }]}>{label ?? fallback}</Text>
    </View>
  );
}

export function SectionTitle({
  title,
  action,
  onAction,
  caption,
}: {
  title: string;
  action?: string;
  onAction?: () => void;
  caption?: string;
}) {
  const colors = useColors();
  return (
    <View style={styles.sectionTitle}>
      <View style={styles.sectionCopy}>
        <Text style={[styles.sectionText, { color: colors.foreground }]}>{title}</Text>
        {caption ? <Text style={[styles.sectionCaption, { color: colors.mutedForeground }]}>{caption}</Text> : null}
      </View>
      {action && onAction ? (
        <Pressable accessibilityRole="button" hitSlop={8} onPress={onAction}>
          <Text style={[styles.sectionAction, { color: colors.primary }]}>{action}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function Meter({ value, tone }: { value: number; tone?: string }) {
  const colors = useColors();
  const clamped = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <View style={[styles.meterTrack, { backgroundColor: colors.muted }]}>
      <View style={[styles.meterFill, { width: `${clamped}%`, backgroundColor: tone ?? colors.primary }]} />
    </View>
  );
}

export function Telemetry({
  icon,
  label,
  value,
  note,
  accent,
  progress,
}: {
  icon: keyof typeof Feather.glyphMap;
  label: string;
  value: string;
  note: string;
  accent?: string;
  progress?: number;
}) {
  const colors = useColors();
  return (
    <Surface style={styles.telemetry}>
      <View style={styles.telemetryTop}>
        <Feather name={icon} size={15} color={accent ?? colors.primary} />
        <Text style={[styles.telemetryLabel, { color: colors.mutedForeground }]}>{label}</Text>
      </View>
      <Text style={[styles.telemetryValue, { color: colors.foreground }]}>{value}</Text>
      {typeof progress === 'number' ? <Meter value={progress} tone={accent ?? colors.primary} /> : null}
      <Text style={[styles.telemetryNote, { color: colors.mutedForeground }]} numberOfLines={1}>{note}</Text>
    </Surface>
  );
}

export function Button({
  label,
  icon,
  onPress,
  variant = 'primary',
  loading = false,
  disabled = false,
  testID,
  style,
}: {
  label: string;
  icon?: keyof typeof Feather.glyphMap;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger';
  loading?: boolean;
  disabled?: boolean;
  testID?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const colors = useColors();
  const background = variant === 'primary' ? colors.primary : variant === 'danger' ? `${colors.destructive}1F` : colors.surfaceRaised;
  const border = variant === 'primary' ? colors.primary : variant === 'danger' ? `${colors.destructive}66` : colors.border;
  const foreground = variant === 'primary' ? colors.primaryForeground : variant === 'danger' ? colors.destructive : colors.foreground;
  const inactive = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: inactive, busy: loading }}
      testID={testID}
      disabled={inactive}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: background, borderColor: border, opacity: inactive ? 0.5 : pressed ? 0.7 : 1 },
        style,
      ]}
    >
      {loading
        ? <ActivityIndicator size="small" color={foreground} />
        : icon ? <Feather name={icon} size={16} color={foreground} /> : null}
      <Text style={[styles.buttonText, { color: foreground }]}>{label}</Text>
    </Pressable>
  );
}

export function EmptyState({
  icon,
  title,
  body,
  action,
}: {
  icon: keyof typeof Feather.glyphMap;
  title: string;
  body: string;
  action?: { label: string; onPress: () => void };
}) {
  const colors = useColors();
  return (
    <View style={[styles.empty, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={[styles.emptyIcon, { backgroundColor: colors.surfaceRaised }]}>
        <Feather name={icon} size={20} color={colors.mutedForeground} />
      </View>
      <Text style={[styles.emptyTitle, { color: colors.foreground }]}>{title}</Text>
      <Text style={[styles.emptyBody, { color: colors.mutedForeground }]}>{body}</Text>
      {action ? (
        <Pressable accessibilityRole="button" onPress={action.onPress} style={({ pressed }) => [styles.emptyAction, { opacity: pressed ? 0.65 : 1 }]}>
          <Text style={[styles.emptyActionText, { color: colors.primary }]}>{action.label}</Text>
          <Feather name="arrow-right" size={13} color={colors.primary} />
        </Pressable>
      ) : null}
    </View>
  );
}

export function CommandInput({
  value,
  onChangeText,
  onSubmit,
  onVoicePress,
  voiceListening = false,
  placeholder = 'Ask your laptop to do something…',
}: {
  value: string;
  onChangeText: (value: string) => void;
  onSubmit: () => void;
  onVoicePress?: () => void;
  voiceListening?: boolean;
  placeholder?: string;
}) {
  const colors = useColors();
  const canSend = value.trim().length > 0;
  return (
    <View style={[styles.commandBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <Feather name="terminal" size={17} color={colors.primary} />
      <TextInput
        testID="command-input"
        value={value}
        onChangeText={onChangeText}
        onSubmitEditing={onSubmit}
        placeholder={placeholder}
        placeholderTextColor={colors.mutedForeground}
        returnKeyType="send"
        style={[styles.commandText, { color: colors.foreground }]}
        multiline
        maxLength={2000}
      />
      <Pressable
        accessibilityLabel={voiceListening ? 'Stop voice input' : 'Use voice input'}
        accessibilityRole="button"
        testID="voice-command"
        onPress={onVoicePress}
        style={({ pressed }) => [
          styles.voiceButton,
          { backgroundColor: voiceListening ? colors.accent : colors.surfaceRaised, borderColor: voiceListening ? colors.primary : colors.border, opacity: pressed ? 0.68 : 1 },
        ]}
      >
        <Feather name={voiceListening ? 'mic-off' : 'mic'} size={16} color={voiceListening ? colors.destructive : colors.primary} />
      </Pressable>
      <Pressable
        accessibilityLabel="Send command"
        accessibilityRole="button"
        accessibilityState={{ disabled: !canSend }}
        testID="queue-command"
        disabled={!canSend}
        onPress={onSubmit}
        style={({ pressed }) => [styles.sendButton, { backgroundColor: canSend ? colors.primary : colors.muted, opacity: pressed ? 0.68 : 1 }]}
      >
        <Feather name="arrow-up" size={17} color={canSend ? colors.primaryForeground : colors.mutedForeground} />
      </Pressable>
    </View>
  );
}

export const styles = StyleSheet.create({
  screen: { flex: 1 },
  screenContent: { paddingHorizontal: 18 },
  header: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 22, gap: 10 },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  headerCopy: { flex: 1 },
  headerRight: { flexDirection: 'row', gap: 8, paddingTop: 2 },
  eyebrow: { fontSize: 10, fontFamily: 'Inter_700Bold', letterSpacing: 1.8, marginBottom: 5 },
  headerTitle: { fontSize: 27, lineHeight: 31, fontFamily: 'Inter_700Bold', letterSpacing: -0.7 },
  headerSubtitle: { fontSize: 12.5, fontFamily: 'Inter_400Regular', marginTop: 4 },
  iconButton: { width: 40, height: 40, borderRadius: 13, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  surface: { borderWidth: 1, borderRadius: 18, padding: 16 },
  sectionTitle: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginTop: 24, marginBottom: 11, gap: 10 },
  sectionCopy: { flex: 1 },
  sectionText: { fontSize: 15.5, fontFamily: 'Inter_600SemiBold', letterSpacing: -0.2 },
  sectionCaption: { fontSize: 11, fontFamily: 'Inter_400Regular', marginTop: 3 },
  sectionAction: { fontSize: 12, fontFamily: 'Inter_600SemiBold', paddingBottom: 2 },
  statusPill: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 99, borderWidth: 1, paddingHorizontal: 9, paddingVertical: 6 },
  statusDot: { height: 6, width: 6, borderRadius: 99 },
  statusText: { fontSize: 10, fontFamily: 'Inter_700Bold', letterSpacing: 0.7 },
  telemetry: { flex: 1, minWidth: 96, padding: 12, borderRadius: 15 },
  telemetryTop: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  telemetryLabel: { fontSize: 10.5, fontFamily: 'Inter_500Medium' },
  telemetryValue: { fontSize: 18, fontFamily: 'Inter_700Bold', marginTop: 6, letterSpacing: -0.3 },
  telemetryNote: { fontSize: 9.5, fontFamily: 'Inter_400Regular', marginTop: 7 },
  meterTrack: { height: 4, borderRadius: 99, overflow: 'hidden', marginTop: 7 },
  meterFill: { height: '100%', borderRadius: 99 },
  button: { minHeight: 48, borderRadius: 14, borderWidth: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 16 },
  buttonText: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  empty: { alignItems: 'center', paddingVertical: 28, paddingHorizontal: 20, borderWidth: 1, borderRadius: 18, gap: 7 },
  emptyIcon: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginBottom: 3 },
  emptyTitle: { fontSize: 14.5, fontFamily: 'Inter_600SemiBold' },
  emptyBody: { fontSize: 11.5, lineHeight: 17, textAlign: 'center', maxWidth: 260, fontFamily: 'Inter_400Regular' },
  emptyAction: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 8 },
  emptyActionText: { fontSize: 12, fontFamily: 'Inter_600SemiBold' },
  commandBox: { flexDirection: 'row', alignItems: 'center', gap: 9, minHeight: 62, paddingHorizontal: 13, borderRadius: 18, borderWidth: 1 },
  commandText: { flex: 1, fontSize: 14, fontFamily: 'Inter_400Regular', minHeight: 36, maxHeight: 96, paddingTop: 8, paddingBottom: 8 },
  voiceButton: { width: 36, height: 36, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  sendButton: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
});
