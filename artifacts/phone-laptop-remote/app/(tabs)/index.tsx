import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import * as Speech from 'expo-speech';
import { useColors } from '@/hooks/useColors';
import { useRemote } from '@/context/RemoteContext';
import { CommandInput, Header, IconButton, Screen, SectionTitle, StatusPill, Surface, Telemetry } from '@/components/RemoteUI';
import { sendAgentAction } from '@/lib/agentClient';
import { confirmUserAction, showUserMessage } from '@/lib/userPrompt';

type SystemSnapshot = {
  cpu_percent?: number;
  memory_percent?: number;
  uptime_seconds?: number;
};

type SpeechRecognitionPackage = typeof import('expo-speech-recognition');

const quickActions: { icon: keyof typeof Feather.glyphMap; label: string; command?: string; route?: '/files' | '/terminal'; detail: string }[] = [
  { icon: 'folder', label: 'Files', route: '/files', detail: 'Browse and edit text files' },
  { icon: 'terminal', label: 'Terminal', route: '/terminal', detail: 'Run a confirmed command' },
  { icon: 'download', label: 'Downloads', command: 'Open Downloads folder', detail: 'Open laptop Downloads' },
  { icon: 'monitor', label: 'Desktop', command: 'Show my desktop', detail: 'Minimize open windows' },
  { icon: 'grid', label: 'Task Manager', command: 'Open Task Manager', detail: 'Open Windows processes' },
  { icon: 'cpu', label: 'System', command: 'Show system status', detail: 'Read live telemetry' },
];

function QuickAction({ item, onPress }: { item: typeof quickActions[number]; onPress: () => void }) {
  const colors = useColors();
  return <Pressable accessibilityLabel={item.label} testID={`quick-${item.label}`} onPress={onPress} style={({ pressed }) => [quickStyles.tile, { backgroundColor: colors.card, borderColor: colors.border, opacity: pressed ? 0.68 : 1 }]}><View style={[quickStyles.icon, { backgroundColor: colors.accent }]}><Feather name={item.icon} size={18} color={colors.primary} /></View><Text style={[quickStyles.label, { color: colors.foreground }]}>{item.label}</Text><Text numberOfLines={1} style={[quickStyles.detail, { color: colors.mutedForeground }]}>{item.detail}</Text></Pressable>;
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

export default function Dashboard() {
  const colors = useColors();
  const router = useRouter();
  const { hydrated, selectedLaptop, commands, queueCommand, settings } = useRemote();
  const [command, setCommand] = useState('');
  const [queuedMessage, setQueuedMessage] = useState('');
  const [voiceListening, setVoiceListening] = useState(false);
  const [agentOnline, setAgentOnline] = useState(false);
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
          setQueuedMessage('Transcript ready. Review it, then tap send.');
        }),
        speech.addListener('error', (event) => {
          setVoiceListening(false);
          voiceSubmissionRef.current = false;
          setQueuedMessage(event.message || 'Voice input stopped. Check microphone permission and try again.');
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
  }, []);

  useEffect(() => {
    let active = true;
    const refresh = async () => {
      if (!selectedLaptop?.token) {
        setAgentOnline(false);
        setSystem(null);
        return;
      }
      try {
        const response = await sendAgentAction(
          selectedLaptop.host,
          selectedLaptop.port,
          selectedLaptop.token,
          'SYSTEM_INFO',
          {},
          false,
          settings.localOnly,
        );
        if (!active) return;
        setAgentOnline(response.success);
        const data = response.data ?? {};
        setSystem({
          cpu_percent: typeof data.cpu_percent === 'number' ? data.cpu_percent : undefined,
          memory_percent: typeof data.memory_percent === 'number' ? data.memory_percent : undefined,
          uptime_seconds: typeof data.uptime_seconds === 'number' ? data.uptime_seconds : undefined,
        });
      } catch {
        if (!active) return;
        setAgentOnline(false);
        setSystem(null);
      }
    };
    void refresh();
    const interval = setInterval(() => { void refresh(); }, 15_000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [selectedLaptop?.host, selectedLaptop?.port, selectedLaptop?.token, settings.localOnly]);

  if (!hydrated) {
    return <View style={[styles.loading, { backgroundColor: colors.background }]}><View style={[styles.loadingBar, { backgroundColor: colors.surfaceRaised }]} /><View style={[styles.loadingCard, { backgroundColor: colors.card }]} /><View style={[styles.loadingCard, { backgroundColor: colors.card }]} /></View>;
  }

  const sendCommand = async (text: string, confirmed = false) => {
    const response = await queueCommand(text, confirmed);
    if (response.requires_confirmation && !confirmed) {
      confirmUserAction('Confirm on your laptop', `${response.message}\n\n${text}`, 'Confirm and send', () => sendCommand(text, true));
      return;
    }
    const details = response.data
      ? Object.entries(response.data).map(([key, value]) => `${key}: ${typeof value === 'object' ? JSON.stringify(value) : String(value)}`).join(' · ')
      : '';
    setQueuedMessage([response.message, details].filter(Boolean).join(' · ').slice(0, 500));
    setCommand('');
    if (voiceSubmissionRef.current) {
      voiceSubmissionRef.current = false;
      void Speech.stop()
        .catch(() => undefined)
        .then(() => Speech.speak(response.message.slice(0, 240), { language: 'en-US', rate: 0.95 }));
    }
  };

  const submit = async () => {
    if (!command.trim()) return;
    const nextCommand = command.trim();
    const isSensitive = /\b(delete|remove|shutdown|shut down|restart|reboot|sleep|terminate|kill)\b/i.test(nextCommand);
    if (settings.confirmCommands && isSensitive) {
      confirmUserAction('Confirm sensitive command', `Send this request to your paired laptop?\n\n${nextCommand}`, 'Confirm', () => sendCommand(nextCommand, true));
      return;
    }
    await sendCommand(nextCommand);
  };

  const startVoiceRecognition = async () => {
    try {
      const speech = speechRecognitionRef.current?.ExpoSpeechRecognitionModule;
      if (!speech) {
        if (nativeVoiceAvailable === null) {
          setQueuedMessage('Voice input is still loading. Try the mic again in a moment.');
        } else {
          showUserMessage('Native voice input unavailable', 'This build does not include the native speech module. In Expo Go, tap the command field and use your phone keyboard microphone. For the in-app mic, install a custom development build.');
        }
        return;
      }
      const permission = await speech.requestPermissionsAsync();
      if (!permission.granted) {
        setQueuedMessage('Microphone or speech-recognition permission was denied. Enable it in your phone settings to use voice input.');
        return;
      }
      voiceSubmissionRef.current = false;
      setCommand('');
      setQueuedMessage('Listening…');
      await Speech.stop();
      speech.start({
        lang: 'en-US',
        interimResults: false,
        continuous: false,
        maxAlternatives: 1,
      });
    } catch {
      setVoiceListening(false);
      setQueuedMessage('Could not start voice input. Check microphone permission and your phone’s speech-recognition service.');
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

  return (
    <Screen>
      <Header title="Control room" subtitle="Your computer, within reach." right={<View style={styles.headerActions}><IconButton icon="clock" label="Command history" onPress={() => router.push('/history')} /><IconButton icon="settings" label="Settings" onPress={() => router.push('/settings')} /></View>} />
      <Surface style={styles.connectionCard} onPress={() => router.push('/devices')}>
        <View style={styles.connectionTop}><View style={styles.laptopIdentity}><View style={[styles.laptopGlyph, { backgroundColor: colors.accent }]}><Feather name="monitor" size={20} color={colors.primary} /></View><View><Text style={[styles.laptopName, { color: colors.foreground }]}>{selectedLaptop?.name ?? 'No laptop paired'}</Text><Text style={[styles.laptopHost, { color: colors.mutedForeground }]}>{selectedLaptop?.host ?? 'Pair a Windows computer to begin'}</Text></View></View><StatusPill status={agentOnline ? 'online' : 'offline'} /></View>
        <View style={[styles.offlineNotice, { borderTopColor: colors.border }]}><Feather name={agentOnline ? 'wifi' : 'wifi-off'} size={14} color={agentOnline ? colors.success : colors.offline} /><Text style={[styles.offlineText, { color: colors.mutedForeground }]}>{agentOnline ? 'Windows agent reachable' : selectedLaptop ? 'Agent offline · telemetry is paused' : 'No Windows agent connected'}</Text><Feather name="chevron-right" size={16} color={colors.mutedForeground} /></View>
      </Surface>

      <SectionTitle title="Live telemetry" action="Devices" onAction={() => router.push('/devices')} />
      <View style={styles.telemetryRow}><Telemetry icon="activity" label="CPU" value={typeof system?.cpu_percent === 'number' ? `${Math.round(system.cpu_percent)}%` : '—'} note={agentOnline ? 'live' : 'waiting for agent'} /><Telemetry icon="database" label="Memory" value={typeof system?.memory_percent === 'number' ? `${Math.round(system.memory_percent)}%` : '—'} note={agentOnline ? 'live' : 'waiting for agent'} /><Telemetry icon="clock" label="Uptime" value={formatUptime(system?.uptime_seconds)} note={agentOnline ? 'live' : 'waiting for agent'} /></View>

      <SectionTitle title="Command" action="History" onAction={() => router.push('/history')} />
      <CommandInput value={command} onChangeText={setCommand} onSubmit={submit} onVoicePress={toggleVoice} voiceListening={voiceListening} />
      {queuedMessage ? <View style={styles.inlineFeedback}><Feather name="check-circle" size={14} color={colors.success} /><Text style={[styles.feedbackText, { color: colors.success }]}>{queuedMessage}</Text></View> : null}
      <Text style={[styles.commandHint, { color: colors.mutedForeground }]}>Tap the mic, speak, review the transcript, then tap send. The phone reads the laptop’s reply aloud. Voice actions still use the same supported commands and confirmations; nothing runs from speech alone.</Text>

      <SectionTitle title="Quick actions" />
      <View style={styles.quickGrid}>{quickActions.map((item) => <QuickAction key={item.label} item={item} onPress={() => item.route ? router.push(item.route) : setCommand(item.command ?? '')} />)}</View>

      <SectionTitle title="Recent" action="View all" onAction={() => router.push('/history')} />
      {commands.length ? <Surface style={styles.recentCard}><View style={[styles.recentIcon, { backgroundColor: colors.accent }]}><Feather name="terminal" size={16} color={colors.primary} /></View><View style={{ flex: 1 }}><Text style={[styles.recentText, { color: colors.foreground }]} numberOfLines={1}>{commands[0].text}</Text><Text style={[styles.recentMeta, { color: colors.mutedForeground }]}>{commands[0].result === 'sent' ? 'Completed' : commands[0].result === 'failed' ? 'Laptop returned an error' : commands[0].result === 'confirmation' ? 'Waiting for confirmation' : 'Saved locally'} · {new Date(commands[0].createdAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</Text></View><StatusPill status={commands[0].result === 'sent' ? 'online' : 'offline'} label={commandLabel(commands[0].result)} /></Surface> : <Surface style={styles.recentEmpty}><Feather name="inbox" size={18} color={colors.mutedForeground} /><Text style={[styles.recentMeta, { color: colors.mutedForeground }]}>Your commands will appear here.</Text></Surface>}
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
