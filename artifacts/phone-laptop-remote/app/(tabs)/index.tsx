import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { useColors } from '@/hooks/useColors';
import { useRemote } from '@/context/RemoteContext';
import { CommandInput, Header, IconButton, Screen, SectionTitle, StatusPill, Surface, Telemetry } from '@/components/RemoteUI';

const quickActions: { icon: keyof typeof Feather.glyphMap; label: string; command: string; detail: string }[] = [
  { icon: 'folder', label: 'Files', command: 'Open my files', detail: 'Browse folders and recent files' },
  { icon: 'grid', label: 'Apps', command: 'Show open apps', detail: 'See what is running' },
  { icon: 'move', label: 'Mouse', command: 'Move the mouse', detail: 'Control the pointer' },
  { icon: 'edit-3', label: 'Keyboard', command: 'Type on my laptop', detail: 'Send a keystroke' },
  { icon: 'monitor', label: 'Screen', command: 'Show my desktop', detail: 'View the current screen' },
  { icon: 'cpu', label: 'System', command: 'Show system status', detail: 'Read live telemetry' },
];

function QuickAction({ item, onPress }: { item: typeof quickActions[number]; onPress: () => void }) {
  const colors = useColors();
  return <Pressable accessibilityLabel={item.label} testID={`quick-${item.label}`} onPress={onPress} style={({ pressed }) => [quickStyles.tile, { backgroundColor: colors.card, borderColor: colors.border, opacity: pressed ? 0.68 : 1 }]}><View style={[quickStyles.icon, { backgroundColor: colors.accent }]}><Feather name={item.icon} size={18} color={colors.primary} /></View><Text style={[quickStyles.label, { color: colors.foreground }]}>{item.label}</Text><Text numberOfLines={1} style={[quickStyles.detail, { color: colors.mutedForeground }]}>{item.detail}</Text></Pressable>;
}

export default function Dashboard() {
  const colors = useColors();
  const router = useRouter();
  const { hydrated, selectedLaptop, commands, queueCommand, settings } = useRemote();
  const [command, setCommand] = useState('');
  const [queuedMessage, setQueuedMessage] = useState('');

  if (!hydrated) {
    return <View style={[styles.loading, { backgroundColor: colors.background }]}><View style={[styles.loadingBar, { backgroundColor: colors.surfaceRaised }]} /><View style={[styles.loadingCard, { backgroundColor: colors.card }]} /><View style={[styles.loadingCard, { backgroundColor: colors.card }]} /></View>;
  }

  const submit = async () => {
    if (!command.trim()) return;
    const nextCommand = command.trim();
    const isSensitive = /\b(delete|remove|shutdown|shut down|restart|reboot|sleep|terminate|kill)\b/i.test(nextCommand);
    if (settings.confirmCommands && isSensitive) {
      Alert.alert('Confirm sensitive command', `Allow Laptop Remote to run “${nextCommand}”?`, [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm',
          style: 'destructive',
          onPress: async () => {
            const result = await queueCommand(nextCommand, true);
            setQueuedMessage(result === 'sent' ? 'Confirmed and sent to your laptop.' : 'Confirmed, but the laptop is offline. It was saved locally.');
            setCommand('');
          },
        },
      ]);
      return;
    }
    const result = await queueCommand(nextCommand);
    setQueuedMessage(result === 'sent' ? 'Sent securely to your laptop.' : 'Saved locally. It will send when your laptop is reachable.');
    setCommand('');
  };

  return (
    <Screen>
      <Header title="Control room" subtitle="Your computer, within reach." right={<View style={styles.headerActions}><IconButton icon="clock" label="Command history" onPress={() => router.push('/history')} /><IconButton icon="settings" label="Settings" onPress={() => router.push('/settings')} /></View>} />
      <Surface style={styles.connectionCard} onPress={() => router.push('/devices')}>
        <View style={styles.connectionTop}><View style={styles.laptopIdentity}><View style={[styles.laptopGlyph, { backgroundColor: colors.accent }]}><Feather name="monitor" size={20} color={colors.primary} /></View><View><Text style={[styles.laptopName, { color: colors.foreground }]}>{selectedLaptop?.name ?? 'No laptop paired'}</Text><Text style={[styles.laptopHost, { color: colors.mutedForeground }]}>{selectedLaptop?.host ?? 'Pair a Windows computer to begin'}</Text></View></View><StatusPill status={selectedLaptop?.status ?? 'offline'} /></View>
        <View style={[styles.offlineNotice, { borderTopColor: colors.border }]}><Feather name="wifi-off" size={14} color={colors.offline} /><Text style={[styles.offlineText, { color: colors.mutedForeground }]}>{selectedLaptop ? 'Agent offline · telemetry is paused' : 'No Windows agent connected'}</Text><Feather name="chevron-right" size={16} color={colors.mutedForeground} /></View>
      </Surface>

      <SectionTitle title="Live telemetry" action="Devices" onAction={() => router.push('/devices')} />
      <View style={styles.telemetryRow}><Telemetry icon="activity" label="CPU" value="—" note="waiting for agent" /><Telemetry icon="database" label="Memory" value="—" note="waiting for agent" /><Telemetry icon="thermometer" label="Temp" value="—" note="waiting for agent" /></View>

      <SectionTitle title="Command" action="History" onAction={() => router.push('/history')} />
      <CommandInput value={command} onChangeText={setCommand} onSubmit={submit} />
      {queuedMessage ? <View style={styles.inlineFeedback}><Feather name="check-circle" size={14} color={colors.success} /><Text style={[styles.feedbackText, { color: colors.success }]}>{queuedMessage}</Text></View> : null}
      <Text style={[styles.commandHint, { color: colors.mutedForeground }]}>Commands are stored on this phone and stay local until the Windows agent connects.</Text>

      <SectionTitle title="Quick actions" />
      <View style={styles.quickGrid}>{quickActions.map((item) => <QuickAction key={item.label} item={item} onPress={() => setCommand(item.command)} />)}</View>

      <SectionTitle title="Recent" action="View all" onAction={() => router.push('/history')} />
      {commands.length ? <Surface style={styles.recentCard}><View style={[styles.recentIcon, { backgroundColor: colors.accent }]}><Feather name="terminal" size={16} color={colors.primary} /></View><View style={{ flex: 1 }}><Text style={[styles.recentText, { color: colors.foreground }]} numberOfLines={1}>{commands[0].text}</Text><Text style={[styles.recentMeta, { color: colors.mutedForeground }]}>Saved locally · {new Date(commands[0].createdAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</Text></View><StatusPill status="offline" label="QUEUED" /></Surface> : <Surface style={styles.recentEmpty}><Feather name="inbox" size={18} color={colors.mutedForeground} /><Text style={[styles.recentMeta, { color: colors.mutedForeground }]}>Your queued commands will appear here.</Text></Surface>}
      <View style={{ height: 12 }} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1, padding: 22, paddingTop: 80, gap: 16 },
  loadingBar: { height: 40, width: '58%', borderRadius: 12 },
  loadingCard: { height: 136, borderRadius: 18 },
  headerActions: { flexDirection: 'row', gap: 8 },
  connectionCard: { padding: 0, overflow: 'hidden' },
  connectionTop: { padding: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  laptopIdentity: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  laptopGlyph: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  laptopName: { fontSize: 16, fontFamily: 'Inter_600SemiBold' },
  laptopHost: { fontSize: 12, fontFamily: 'Inter_400Regular', marginTop: 4 },
  offlineNotice: { borderTopWidth: 1, minHeight: 42, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 8 },
  offlineText: { fontSize: 11, fontFamily: 'Inter_500Medium', flex: 1 },
  telemetryRow: { flexDirection: 'row', gap: 9 },
  inlineFeedback: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10 },
  feedbackText: { fontSize: 11, fontFamily: 'Inter_500Medium', flex: 1 },
  commandHint: { fontSize: 11, lineHeight: 16, fontFamily: 'Inter_400Regular', marginTop: 9, paddingHorizontal: 2 },
  quickGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 9 },
  recentCard: { flexDirection: 'row', alignItems: 'center', gap: 11, padding: 13 },
  recentIcon: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  recentText: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  recentMeta: { fontSize: 11, fontFamily: 'Inter_400Regular', marginTop: 4 },
  recentEmpty: { flexDirection: 'row', gap: 10, alignItems: 'center', padding: 16 },
});

const quickStyles = StyleSheet.create({
  tile: { width: '31.8%', minHeight: 104, borderRadius: 15, borderWidth: 1, padding: 11 },
  icon: { width: 30, height: 30, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginBottom: 9 },
  label: { fontSize: 12, fontFamily: 'Inter_600SemiBold' },
  detail: { fontSize: 9, fontFamily: 'Inter_400Regular', marginTop: 4, lineHeight: 12 },
});
