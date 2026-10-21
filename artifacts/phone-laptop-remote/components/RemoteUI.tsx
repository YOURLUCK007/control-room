import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React from 'react';
import { Platform, Pressable, ScrollView, StyleProp, StyleSheet, Text, TextInput, View, ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';

export function Screen({ children, scroll = true, contentStyle }: { children: React.ReactNode; scroll?: boolean; contentStyle?: ViewStyle }) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const paddingTop = Platform.OS === 'web' ? Math.max(insets.top, 67) : insets.top;
  const style = [styles.screenContent, { paddingTop: paddingTop + 16, paddingBottom: Math.max(insets.bottom, Platform.OS === 'web' ? 34 : 18) + 92 }, contentStyle];
  return scroll ? <ScrollView style={[styles.screen, { backgroundColor: colors.background }]} contentContainerStyle={style} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">{children}</ScrollView> : <View style={[styles.screen, { backgroundColor: colors.background }, style]}>{children}</View>;
}

export function Header({ title, subtitle, back = false, right }: { title: string; subtitle?: string; back?: boolean; right?: React.ReactNode }) {
  const colors = useColors();
  const router = useRouter();
  return (
    <View style={styles.header}>
      <View style={styles.headerLeft}>
        {back ? <IconButton icon="arrow-left" label="Go back" onPress={() => router.back()} /> : null}
        <View>
          <Text style={[styles.eyebrow, { color: colors.primary }]}>LAPTOP REMOTE</Text>
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>{title}</Text>
          {subtitle ? <Text style={[styles.headerSubtitle, { color: colors.mutedForeground }]}>{subtitle}</Text> : null}
        </View>
      </View>
      {right}
    </View>
  );
}

export function IconButton({ icon, label, onPress, tone = 'muted' }: { icon: keyof typeof Feather.glyphMap; label: string; onPress: () => void; tone?: 'muted' | 'primary' }) {
  const colors = useColors();
  return (
    <Pressable accessibilityLabel={label} testID={`icon-${label}`} onPress={onPress} style={({ pressed }) => [styles.iconButton, { backgroundColor: tone === 'primary' ? colors.accent : colors.surfaceRaised, borderColor: tone === 'primary' ? colors.primary : colors.border, opacity: pressed ? 0.65 : 1 }]}>
      <Feather name={icon} size={18} color={tone === 'primary' ? colors.primary : colors.secondaryForeground} />
    </Pressable>
  );
}

export function Surface({ children, style, onPress }: { children: React.ReactNode; style?: StyleProp<ViewStyle>; onPress?: () => void }) {
  const colors = useColors();
  const content = <View style={[styles.surface, { backgroundColor: colors.card, borderColor: colors.border }, style]}>{children}</View>;
  return onPress ? <Pressable onPress={onPress} style={({ pressed }) => ({ opacity: pressed ? 0.82 : 1 })}>{content}</Pressable> : content;
}

export function StatusPill({ status, label }: { status: 'offline' | 'online' | 'connecting'; label?: string }) {
  const colors = useColors();
  const tone = status === 'online' ? colors.success : status === 'connecting' ? colors.warning : colors.offline;
  return <View style={[styles.statusPill, { backgroundColor: `${tone}18`, borderColor: `${tone}55` }]}><View style={[styles.statusDot, { backgroundColor: tone }]} /><Text style={[styles.statusText, { color: tone }]}>{label ?? (status === 'online' ? 'ONLINE' : status === 'connecting' ? 'CONNECTING' : 'OFFLINE')}</Text></View>;
}

export function SectionTitle({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) {
  const colors = useColors();
  return <View style={styles.sectionTitle}><Text style={[styles.sectionText, { color: colors.foreground }]}>{title}</Text>{action && onAction ? <Pressable onPress={onAction}><Text style={[styles.sectionAction, { color: colors.primary }]}>{action}</Text></Pressable> : null}</View>;
}

export function Telemetry({ icon, label, value, note, accent }: { icon: keyof typeof Feather.glyphMap; label: string; value: string; note: string; accent?: string }) {
  const colors = useColors();
  return <Surface style={styles.telemetry}><Feather name={icon} size={17} color={accent ?? colors.primary} /><Text style={[styles.telemetryLabel, { color: colors.mutedForeground }]}>{label}</Text><Text style={[styles.telemetryValue, { color: colors.foreground }]}>{value}</Text><Text style={[styles.telemetryNote, { color: colors.mutedForeground }]}>{note}</Text></Surface>;
}

export function CommandInput({ value, onChangeText, onSubmit, onVoicePress, voiceListening = false, placeholder = 'Ask your laptop to do something…' }: { value: string; onChangeText: (value: string) => void; onSubmit: () => void; onVoicePress?: () => void; voiceListening?: boolean; placeholder?: string }) {
  const colors = useColors();
  return <View style={[styles.commandBox, { backgroundColor: colors.surface, borderColor: colors.border }]}><Feather name="terminal" size={18} color={colors.primary} /><TextInput testID="command-input" value={value} onChangeText={onChangeText} onSubmitEditing={onSubmit} placeholder={placeholder} placeholderTextColor={colors.mutedForeground} returnKeyType="send" style={[styles.commandText, { color: colors.foreground }]} multiline maxLength={2000} /><Pressable accessibilityLabel={voiceListening ? 'Stop voice input' : 'Use voice input'} testID="voice-command" onPress={onVoicePress} style={({ pressed }) => [styles.voiceButton, { backgroundColor: voiceListening ? colors.accent : colors.surfaceRaised, borderColor: colors.border, opacity: pressed ? 0.68 : 1 }]}><Feather name={voiceListening ? 'mic-off' : 'mic'} size={17} color={colors.primary} /></Pressable><Pressable accessibilityLabel="Queue command" testID="queue-command" onPress={onSubmit} style={({ pressed }) => [styles.sendButton, { backgroundColor: colors.primary, opacity: pressed ? 0.68 : 1 }]}><Feather name="arrow-up" size={18} color={colors.primaryForeground} /></Pressable></View>;
}

export const styles = StyleSheet.create({
  screen: { flex: 1 },
  screenContent: { paddingHorizontal: 18 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 26 },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  eyebrow: { fontSize: 10, fontFamily: 'Inter_700Bold', letterSpacing: 1.8, marginBottom: 5 },
  headerTitle: { fontSize: 28, lineHeight: 32, fontFamily: 'Inter_700Bold', letterSpacing: -0.7 },
  headerSubtitle: { fontSize: 13, fontFamily: 'Inter_400Regular', marginTop: 4 },
  iconButton: { width: 40, height: 40, borderRadius: 13, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  surface: { borderWidth: 1, borderRadius: 18, padding: 16 },
  sectionTitle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 25, marginBottom: 11 },
  sectionText: { fontSize: 16, fontFamily: 'Inter_600SemiBold', letterSpacing: -0.2 },
  sectionAction: { fontSize: 12, fontFamily: 'Inter_600SemiBold' },
  statusPill: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 99, borderWidth: 1, paddingHorizontal: 9, paddingVertical: 6 },
  statusDot: { height: 6, width: 6, borderRadius: 99 },
  statusText: { fontSize: 10, fontFamily: 'Inter_700Bold', letterSpacing: 0.7 },
  telemetry: { flex: 1, minWidth: 100, padding: 13, borderRadius: 15 },
  telemetryLabel: { fontSize: 11, fontFamily: 'Inter_500Medium', marginTop: 10 },
  telemetryValue: { fontSize: 17, fontFamily: 'Inter_700Bold', marginTop: 3 },
  telemetryNote: { fontSize: 10, fontFamily: 'Inter_400Regular', marginTop: 3 },
  commandBox: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 62, paddingHorizontal: 14, borderRadius: 18, borderWidth: 1 },
  commandText: { flex: 1, fontSize: 14, fontFamily: 'Inter_400Regular', minHeight: 36, maxHeight: 72, paddingTop: 8, paddingBottom: 8 },
  voiceButton: { width: 36, height: 36, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  sendButton: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
});