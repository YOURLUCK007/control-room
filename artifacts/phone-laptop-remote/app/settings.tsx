import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Header, IconButton, Screen, SectionTitle, Surface } from '@/components/RemoteUI';
import { useColors } from '@/hooks/useColors';
import { useRemote } from '@/context/RemoteContext';

function ToggleRow({ icon, title, body, value, onChange }: { icon: keyof typeof Feather.glyphMap; title: string; body: string; value: boolean; onChange: (next: boolean) => void }) {
  const colors = useColors();
  return <Pressable accessibilityRole="switch" accessibilityState={{ checked: value }} onPress={() => onChange(!value)} style={({ pressed }) => [styles.toggleRow, { borderBottomColor: colors.border, opacity: pressed ? 0.7 : 1 }]}><View style={[styles.settingIcon, { backgroundColor: colors.surfaceRaised }]}><Feather name={icon} size={16} color={colors.primary} /></View><View style={{ flex: 1 }}><Text style={[styles.settingTitle, { color: colors.foreground }]}>{title}</Text><Text style={[styles.settingBody, { color: colors.mutedForeground }]}>{body}</Text></View><View style={[styles.toggle, { backgroundColor: value ? colors.primary : colors.muted, borderColor: value ? colors.primary : colors.border }]}><View style={[styles.toggleKnob, { backgroundColor: value ? colors.primaryForeground : colors.mutedForeground, transform: [{ translateX: value ? 10 : 0 }] }]} /></View></Pressable>;
}

export default function SettingsScreen() {
  const colors = useColors();
  const router = useRouter();
  const { settings, updateSettings } = useRemote();
  return <Screen><Header title="Settings" subtitle="Safety and connection preferences" back right={<IconButton icon="shield" label="Devices" onPress={() => router.push('/devices')} />} /><Surface style={styles.trustCard}><View style={[styles.trustIcon, { backgroundColor: colors.accent }]}><Feather name="lock" size={19} color={colors.primary} /></View><View style={{ flex: 1 }}><Text style={[styles.trustTitle, { color: colors.foreground }]}>Your control room is local</Text><Text style={[styles.trustBody, { color: colors.mutedForeground }]}>No commands leave this phone until a Windows agent is explicitly paired.</Text></View></Surface><SectionTitle title="Confirmation policy" /><Surface style={styles.settingsCard}><ToggleRow icon="alert-circle" title="Confirm sensitive commands" body="Ask before shutdown, delete, or app changes." value={settings.confirmCommands} onChange={(value) => updateSettings({ confirmCommands: value })} /></Surface><SectionTitle title="Security" /><Surface style={styles.settingsCard}><ToggleRow icon="wifi-off" title="Local-only mode" body="Keep the app from attempting connections outside your paired network." value={settings.localOnly} onChange={(value) => updateSettings({ localOnly: value })} /></Surface><SectionTitle title="About this build" /><Surface style={styles.about}><View style={styles.aboutLine}><Text style={[styles.aboutLabel, { color: colors.mutedForeground }]}>Connection</Text><Text style={[styles.aboutValue, { color: colors.foreground }]}>Windows agent not connected</Text></View><View style={styles.aboutLine}><Text style={[styles.aboutLabel, { color: colors.mutedForeground }]}>Protocol</Text><Text style={[styles.aboutValue, { color: colors.foreground }]}>TLS + one-time pairing</Text></View></Surface></Screen>;
}

const styles = StyleSheet.create({
  trustCard: { flexDirection: 'row', gap: 12, alignItems: 'center', padding: 15 },
  trustIcon: { width: 40, height: 40, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  trustTitle: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  trustBody: { fontSize: 11, lineHeight: 16, fontFamily: 'Inter_400Regular', marginTop: 3 },
  settingsCard: { paddingVertical: 0, overflow: 'hidden' },
  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: 11, paddingVertical: 14, borderBottomWidth: 1 },
  settingIcon: { width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  settingTitle: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  settingBody: { fontSize: 10, lineHeight: 15, fontFamily: 'Inter_400Regular', marginTop: 3, paddingRight: 6 },
  toggle: { width: 32, height: 20, borderWidth: 1, borderRadius: 99, padding: 2, justifyContent: 'center' },
  toggleKnob: { width: 14, height: 14, borderRadius: 99 },
  about: { gap: 13, padding: 15 },
  aboutLine: { flexDirection: 'row', justifyContent: 'space-between', gap: 10 },
  aboutLabel: { fontSize: 11, fontFamily: 'Inter_400Regular' },
  aboutValue: { fontSize: 11, fontFamily: 'Inter_600SemiBold', textAlign: 'right', flex: 1 },
});