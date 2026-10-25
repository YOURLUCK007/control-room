import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Platform, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import * as Speech from 'expo-speech';
import { useColors } from '@/hooks/useColors';
import { useRemote } from '@/context/RemoteContext';
import {
  Button,
  CommandInput,
  EmptyState,
  Header,
  IconButton,
  Screen,
  SectionTitle,
  StatusPill,
  Surface,
  Telemetry,
} from '@/components/RemoteUI';
import { useToast } from '@/components/Toast';
import { confirmUserAction, showUserMessage } from '@/lib/userPrompt';

type SystemSnapshot = {
  cpu_percent?: number;
  memory_percent?: number;
  uptime_seconds?: number;
};

type SpeechRecognitionPackage = typeof import('expo-speech-recognition');

type QuickActionItem = {
  icon: keyof typeof Feather.glyphMap;
  label: string;
  command?: string;
  route?: '/files' | '/terminal';
  detail: string;
};

const quickActions: QuickActionItem[] = [
  { icon: 'folder', label: 'Files', route: '/files', detail: 'Browse and edit text files' },
  { icon: 'terminal', label: 'Terminal', route: '/terminal', detail: 'Run a confirmed command' },
  { icon: 'download', label: 'Downloads', command: 'Open Downloads folder', detail: 'Open laptop Downloads' },
  { icon: 'monitor', label: 'Desktop', command: 'Show my desktop', detail: 'Minimize open windows' },
  { icon: 'grid', label: 'Task Manager', command: 'Open Task Manager', detail: 'Open Windows processes' },
  { icon: 'cpu', label: 'System', command: 'Show system status', detail: 'Read live telemetry' },
];

function QuickAction({ item, onPress, busy }: { item: QuickActionItem; onPress: () => void; busy: boolean }) {
  const colors = useColors();
  return (
    <Pressable
      accessibilityLabel={`${item.label}: ${item.detail}`}
      accessibilityRole="button"
      testID={`quick-${item.label}`}
      onPress={onPress}
      style={({ pressed }) => [
        quickStyles.tile,
        { backgroundColor: colors.card, borderColor: colors.border, opacity: busy || pressed ? 0.6 : 1 },
      ]}
    >
      <View style={[quickStyles.icon, { backgroundColor: colors.accent }]}>
        <Feather name={busy ? 'loader' : item.icon} size={17} color={colors.primary} />
      </View>
      <Text style={[quickStyles.label, { color: colors.foreground }]} numberOfLines={1}>{item.label}</Text>
      <Text numberOfLines={2} style={[quickStyles.detail, { color: colors.mutedForeground }]}>{item.detail}</Text>
    </Pressable>
  );
}

function commandLabel(result?: string) {
  if (result === 'sent') return 'DONE';
  if (result === 'confirmation') return 'CONFIRM';
  if (result === 'failed') return 'FAILED';
  if (result === 'offline') return 'LOCAL ONLY';
  return 'QUEUED';
}

function formatUptime(seconds?: number) {
  if (typeof seconds !== 'number' || seconds < 0) return '—';
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return hours >= 24 ? `${Math.floor(hours / 24)}d ${hours % 24}h` : `${hours}h ${minutes}m`;
}

function formatChecked(value?: string) {
  if (!value) return 'never';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'never';
  return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

export default function Dashboard() {
  const colors = useColors();
  const router = useRouter();
  const toast = useToast();
  const {
    hydrated,
    selectedLaptop,
    selectedStatus,
    commands,
    queueCommand,
    runAction,
    checkConnection,
    settings,
  } = useRemote();
  const [command, setCommand] = useState('');
  const [lastReply, setLastReply] = useState('');
  const [sending, setSending] = useState(false);
  const [quickBusy, setQuickBusy] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [voiceListening, setVoiceListening] = useState(false);
  const [system, setSystem] = useState<SystemSnapshot | null>(null);
  const [nativeVoiceAvailable, setNativeVoiceAvailable] = useState<boolean | null>(null);
  const voiceSubmissionRef = useRef(false);
  const speechRecognitionRef = useRef<SpeechRecognitionPackage | null>(null);

  useEffect(() => {
    let active = true;
    let listeners: { remove: () => void }[] = [];
    void import('expo-speech-recognition').then((module) => {
      if (!active) return;
      speechRecognitionRef.current = module;
      setNativeVoiceAvailable(true);
      const speech = module.ExpoSpeechRecognitionModule;
      listeners = [
        speech.addListener('start', () => setVoiceListening(true)),
        speech.addListener('end', () => setVoiceListening(false)),
        speech.addListener('result', (event) => {
          const transcript = event.results[0]?.transcript?.trim();
          if (!transcript) return;
          voiceSubmissionRef.current = true;
          setCommand(transcript);
          toast.show({ kind: 'info', title: 'Transcript ready', message: 'Review it, then tap send.' });
        }),
        speech.addListener('error', (event) => {
          setVoiceListening(false);
          voiceSubmissionRef.current = false;
          toast.show({ kind: 'error', title: 'Voice input stopped', message: event.message || 'Check microphone permission and try again.' });
        }),
      ];
    }).catch(() => {
      // Expo Go does not include this native module; keyboard dictation remains available.
      if (active) setNativeVoiceAvailable(false);
    });
    return () => {
      active = false;
      listeners.forEach((listener) => listener.remove());
      speechRecognitionRef.current?.ExpoSpeechRecognitionModule.abort();
      speechRecognitionRef.current = null;
      void Speech.stop();
    };
  }, [toast]);

  const loadTelemetry = useCallback(async () => {
    if (!selectedLaptop?.token) {
      setSystem(null);
      return;
    }
    const response = await runAction('SYSTEM_INFO');
    if (!response.success) {
      setSystem(null);
      return;
    }
    const data = response.data ?? {};
    setSystem({
      cpu_percent: typeof data.cpu_percent === 'number' ? data.cpu_percent : undefined,
      memory_percent: typeof data.memory_percent === 'number' ? data.memory_percent : undefined,
      uptime_seconds: typeof data.uptime_seconds === 'number' ? data.uptime_seconds : undefined,
    });
  }, [runAction, selectedLaptop?.token]);

  useEffect(() => {
    void loadTelemetry();
    const interval = setInterval(() => { void loadTelemetry(); }, 15_000);
    return () => clearInterval(interval);
  }, [loadTelemetry]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      if (selectedLaptop) await checkConnection(selectedLaptop.id);
      await loadTelemetry();
    } finally {
      setRefreshing(false);
    }
  }, [checkConnection, loadTelemetry, selectedLaptop]);

  const sendCommand = useCallback(async (text: string, confirmed = false) => {
    setSending(true);
    try {
      const response = await queueCommand(text, confirmed);
      if (response.requires_confirmation && !confirmed) {
        confirmUserAction('Confirm on your laptop', `${response.message}\n\n${text}`, 'Confirm and send', () => sendCommand(text, true));
        return;
      }
      setLastReply(response.message);
      setCommand('');
      const kind = response.result === 'sent' ? 'success' : response.result === 'confirmation' ? 'info' : 'error';
      toast.show({ kind, title: response.result === 'sent' ? 'Sent to your laptop' : 'Command not completed', message: response.message });
      if (voiceSubmissionRef.current) {
        voiceSubmissionRef.current = false;
        void Speech.stop()
          .catch(() => undefined)
          .then(() => Speech.speak(response.message.slice(0, 240), { language: 'en-US', rate: 0.95 }));
      } else {
        await Speech.stop();
      }
    } finally {
      setSending(false);
    }
  }, [queueCommand, toast]);

  const submit = async () => {
    if (!command.trim() || sending) return;
    const nextCommand = command.trim();
    const isSensitive = /\b(delete|remove|shutdown|shut down|restart|reboot|sleep|terminate|kill)\b/i.test(nextCommand);
    if (settings.confirmCommands && isSensitive) {
      confirmUserAction('Confirm sensitive command', `Send this request to your paired laptop?\n\n${nextCommand}`, 'Confirm', () => sendCommand(nextCommand, true));
      return;
    }
    await sendCommand(nextCommand);
  };

  const runQuickAction = async (item: QuickActionItem) => {
    if (item.route) {
      router.push(item.route);
      return;
    }
    if (!item.command) return;
    if (!selectedLaptop?.token) {
      toast.show({ kind: 'info', title: 'No laptop paired', message: 'Pair a Windows computer to run this action.' });
      router.push('/pair');
      return;
    }
    setQuickBusy(item.label);
    try {
      await sendCommand(item.command);
      if (item.label === 'System') void loadTelemetry();
    } finally {
      setQuickBusy(null);
    }
  };

  const startVoiceRecognition = async () => {
    try {
      const speech = speechRecognitionRef.current?.ExpoSpeechRecognitionModule;
      if (!speech) {
        if (nativeVoiceAvailable === null) {
          toast.show({ kind: 'info', title: 'Voice input is loading', message: 'Try the mic again in a moment.' });
        } else {
          showUserMessage(
            'Native voice input unavailable',
            'This build does not include the native speech module. In Expo Go, tap the command field and use your phone keyboard microphone. For the in-app mic, install a custom development build.',
          );
        }
        return;
      }
      const permission = await speech.requestPermissionsAsync();
      if (!permission.granted) {
        toast.show({ kind: 'error', title: 'Microphone permission denied', message: 'Enable it in your phone settings to use voice input.' });
        return;
      }
      voiceSubmissionRef.current = false;
      setCommand('');
      await Speech.stop();
      speech.start({
        lang: 'en-US',
        interimResults: false,
        continuous: false,
        maxAlternatives: 1,
      });
    } catch {
      setVoiceListening(false);
      toast.show({ kind: 'error', title: 'Could not start voice input', message: 'Check microphone permission and your phone’s speech service.' });
    }
  };

  const toggleVoice = () => {
    if (voiceListening) {
      speechRecognitionRef.current?.ExpoSpeechRecognitionModule.stop();
      return;
    }
    confirmUserAction(
      'Start voice input?',
      'Your phone’s speech-recognition service may process the audio. The transcript stays in this app; nothing is sent to the laptop until you review it and tap send.',
      'Start listening',
      () => { void startVoiceRecognition(); },
    );
  };

  if (!hydrated) {
    return (
      <Screen bottomPadding={96}>
        <View style={styles.loadingBar} ><View style={[styles.skeleton, { backgroundColor: colors.surfaceRaised, height: 14, width: '38%' }]} /></View>
        <View style={[styles.skeleton, { backgroundColor: colors.card, height: 118, borderRadius: 18, marginBottom: 16 }]} />
        <View style={{ flexDirection: 'row', gap: 9 }}>
          {[0, 1, 2].map((key) => <View key={key} style={[styles.skeleton, { backgroundColor: colors.card, height: 108, borderRadius: 15, flex: 1 }]} />)}
        </View>
      </Screen>
    );
  }

  const cpu = typeof system?.cpu_percent === 'number' ? Math.round(system.cpu_percent) : undefined;
  const memory = typeof system?.memory_percent === 'number' ? Math.round(system.memory_percent) : undefined;
  const online = selectedStatus.state === 'online';
  const statusState = selectedStatus.state === 'connecting' ? 'connecting' : online ? 'online' : 'offline';

  return (
    <Screen
      bottomPadding={96}
      refreshControl={Platform.OS === 'web' ? undefined : (
        <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.primary} colors={[colors.primary]} />
      )}
    >
      <Header
        title="Control room"
        subtitle="Your computer, within reach."
        right={(
          <View style={styles.headerActions}>
            <IconButton icon="clock" label="Command history" onPress={() => router.push('/history')} />
            <IconButton icon="settings" label="Settings" onPress={() => router.push('/settings')} />
          </View>
        )}
      />

      <Surface style={styles.connectionCard} onPress={() => router.push('/devices')} accessibilityLabel="Open paired devices">
        <View style={styles.connectionTop}>
          <View style={styles.laptopIdentity}>
            <View style={[styles.laptopGlyph, { backgroundColor: online ? colors.accent : colors.surfaceRaised }]}>
              <Feather name="monitor" size={20} color={online ? colors.primary : colors.mutedForeground} />
            </View>
            <View style={styles.laptopCopy}>
              <Text style={[styles.laptopName, { color: colors.foreground }]} numberOfLines={1}>{selectedLaptop?.name ?? 'No laptop paired'}</Text>
              <Text style={[styles.laptopHost, { color: colors.mutedForeground }]} numberOfLines={1}>
                {selectedLaptop
                  ? `${selectedLaptop.scheme ? `${selectedLaptop.scheme}://` : ''}${selectedLaptop.host}:${selectedLaptop.port}`
                  : 'Pair a Windows computer to begin'}
              </Text>
            </View>
          </View>
          <StatusPill status={statusState} />
        </View>
        <View style={[styles.offlineNotice, { borderTopColor: colors.border }]}>
          <Feather
            name={online ? 'wifi' : selectedStatus.state === 'connecting' ? 'loader' : 'wifi-off'}
            size={13}
            color={online ? colors.success : selectedStatus.state === 'connecting' ? colors.warning : colors.offline}
          />
          <Text style={[styles.offlineText, { color: colors.mutedForeground }]} numberOfLines={1}>
            {online
              ? `${selectedStatus.latencyMs ? `${selectedStatus.latencyMs} ms` : 'Connected'} · checked ${formatChecked(selectedStatus.checkedAt)}`
              : selectedStatus.state === 'connecting'
                ? 'Checking the Windows agent…'
                : selectedStatus.message ?? (selectedLaptop ? 'Agent offline · tap to reconnect' : 'No Windows agent connected')}
          </Text>
          <Feather name="chevron-right" size={15} color={colors.mutedForeground} />
        </View>
      </Surface>

      <SectionTitle
        title="Live telemetry"
        action="Refresh"
        onAction={() => { void refresh(); }}
        caption={online ? 'Updates every 15 seconds' : 'Waiting for the agent'}
      />
      <View style={styles.telemetryRow}>
        <Telemetry icon="activity" label="CPU" value={cpu !== undefined ? `${cpu}%` : '—'} note={online ? 'live' : 'paused'} progress={cpu} />
        <Telemetry icon="database" label="Memory" value={memory !== undefined ? `${memory}%` : '—'} note={online ? 'live' : 'paused'} progress={memory} accent={memory !== undefined && memory > 85 ? colors.warning : undefined} />
        <Telemetry icon="clock" label="Uptime" value={formatUptime(system?.uptime_seconds)} note={online ? 'since boot' : 'paused'} />
      </View>

      <SectionTitle title="Command" action="History" onAction={() => router.push('/history')} />
      <CommandInput value={command} onChangeText={setCommand} onSubmit={submit} onVoicePress={toggleVoice} voiceListening={voiceListening} />
      {lastReply ? (
        <Pressable onPress={() => setLastReply('')} accessibilityLabel="Dismiss last reply" style={styles.replyRow}>
          <Feather name="message-square" size={13} color={colors.primary} />
          <Text style={[styles.replyText, { color: colors.mutedForeground }]} numberOfLines={3}>{lastReply}</Text>
          <Feather name="x" size={12} color={colors.mutedForeground} />
        </Pressable>
      ) : (
        <Text style={[styles.commandHint, { color: colors.mutedForeground }]}>
          Voice actions use the same supported commands and confirmations; nothing runs from speech alone.
        </Text>
      )}

      <SectionTitle title="Quick actions" caption={selectedLaptop ? 'Runs on your paired laptop' : 'Pair a laptop to use these'} />
      <View style={styles.quickGrid}>
        {quickActions.map((item) => (
          <QuickAction key={item.label} item={item} busy={quickBusy === item.label} onPress={() => { void runQuickAction(item); }} />
        ))}
      </View>

      {!selectedLaptop ? (
        <>
          <SectionTitle title="Get started" />
          <EmptyState
            icon="link"
            title="Pair your Windows computer"
            body="Start the agent on your PC, then enter its LAN address and the six-digit code it prints."
            action={{ label: 'Pair a computer', onPress: () => router.push('/pair') }}
          />
        </>
      ) : null}

      <SectionTitle title="Recent" action="View all" onAction={() => router.push('/history')} />
      {commands.length ? (
        <Surface style={styles.recentCard}>
          {commands.slice(0, 3).map((item, index) => (
            <Pressable
              key={item.id}
              onPress={() => router.push('/history')}
              style={[styles.recentRow, index > 0 && { borderTopWidth: 1, borderTopColor: colors.border }]}
            >
              <View style={[styles.recentIcon, { backgroundColor: colors.surfaceRaised }]}>
                <Feather name="terminal" size={14} color={colors.primary} />
              </View>
              <View style={styles.recentCopy}>
                <Text style={[styles.recentText, { color: colors.foreground }]} numberOfLines={1}>{item.text}</Text>
                <Text style={[styles.recentMeta, { color: colors.mutedForeground }]} numberOfLines={1}>
                  {item.result === 'sent' ? 'Completed' : item.result === 'failed' ? 'Laptop returned an error' : item.result === 'confirmation' ? 'Waiting for confirmation' : 'Saved locally'} · {new Date(item.createdAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                </Text>
              </View>
              <StatusPill status={item.result === 'sent' ? 'online' : 'offline'} label={commandLabel(item.result)} />
            </Pressable>
          ))}
        </Surface>
      ) : (
        <EmptyState
          icon="inbox"
          title="No commands yet"
          body="Ask your laptop to open an app, show the desktop, or share its status. Everything you send is saved here."
          action={{ label: 'Try a quick action', onPress: () => { void runQuickAction(quickActions[4]); } }}
        />
      )}

      {selectedLaptop && !online ? (
        <Button
          label="Reconnect to laptop"
          icon="refresh-cw"
          variant="secondary"
          loading={selectedStatus.state === 'connecting'}
          onPress={() => { void refresh(); }}
          style={{ marginTop: 16 }}
        />
      ) : null}
      <View style={{ height: 8 }} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  loadingBar: { paddingVertical: 8 },
  skeleton: { marginBottom: 14 },
  headerActions: { flexDirection: 'row', gap: 8 },
  connectionCard: { padding: 0, overflow: 'hidden' },
  connectionTop: { padding: 15, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  laptopIdentity: { flexDirection: 'row', alignItems: 'center', gap: 11, flex: 1 },
  laptopCopy: { flex: 1 },
  laptopGlyph: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  laptopName: { fontSize: 15.5, fontFamily: 'Inter_600SemiBold' },
  laptopHost: { fontSize: 11, fontFamily: 'Inter_400Regular', marginTop: 4 },
  offlineNotice: { borderTopWidth: 1, minHeight: 40, paddingHorizontal: 15, flexDirection: 'row', alignItems: 'center', gap: 8 },
  offlineText: { fontSize: 10.5, fontFamily: 'Inter_500Medium', flex: 1 },
  telemetryRow: { flexDirection: 'row', gap: 9 },
  replyRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 7, marginTop: 11, paddingHorizontal: 2 },
  replyText: { fontSize: 11, lineHeight: 16, fontFamily: 'Inter_400Regular', flex: 1 },
  commandHint: { fontSize: 10.5, lineHeight: 16, fontFamily: 'Inter_400Regular', marginTop: 10, paddingHorizontal: 2 },
  quickGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 9 },
  recentCard: { padding: 0, overflow: 'hidden' },
  recentRow: { flexDirection: 'row', alignItems: 'center', gap: 11, padding: 13 },
  recentIcon: { width: 30, height: 30, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  recentCopy: { flex: 1 },
  recentText: { fontSize: 12.5, fontFamily: 'Inter_600SemiBold' },
  recentMeta: { fontSize: 10, fontFamily: 'Inter_400Regular', marginTop: 3 },
});

const quickStyles = StyleSheet.create({
  tile: { width: '31.8%', minHeight: 108, borderRadius: 16, borderWidth: 1, padding: 11 },
  icon: { width: 30, height: 30, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginBottom: 9 },
  label: { fontSize: 12, fontFamily: 'Inter_600SemiBold' },
  detail: { fontSize: 9.5, fontFamily: 'Inter_400Regular', marginTop: 4, lineHeight: 13 },
});
