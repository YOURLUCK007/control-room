import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
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

type SpeechRecognizer = {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

type SpeechRuntime = typeof globalThis & {
  SpeechRecognition?: new () => SpeechRecognizer;
  webkitSpeechRecognition?: new () => SpeechRecognizer;
};

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
  const speechRef = useRef<SpeechRecognizer | null>(null);

  useEffect(() => () => {
    speechRef.current?.stop();
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

  const toggleVoice = () => {
    if (voiceListening) {
      speechRef.current?.stop();
      return;
    }
    const runtime = globalThis as SpeechRuntime;
    const Recognition = runtime.SpeechRecognition ?? runtime.webkitSpeechRecognition;
    if (!Recognition) {
      showUserMessage('Voice typing', 'Tap the command field and use the microphone on your phone keyboard to dictate. Your keyboard’s speech provider may process the audio; the transcript stays in the field until you tap send.');
      return;
    }
    const startListening = () => {
      const recognition = new Recognition();
      recognition.lang = 'en-US';
      recognition.interimResults = false;
      recognition.maxAlternatives = 1;
      recognition.onresult = (event) => {
        const transcript = event.results[0]?.[0]?.transcript?.trim();
        if (transcript) {
          setCommand(transcript);
          setQueuedMessage('Voice transcription ready. Review it before sending.');
        }
      };
      recognition.onerror = () => {
        setVoiceListening(false);
        setQueuedMessage('Voice input stopped. Check microphone permission or use your phone keyboard dictation.');
      };
      recognition.onend = () => {
        setVoiceListening(false);
        speechRef.current = null;
      };
      speechRef.current = recognition;
      setVoiceListening(true);
      setQueuedMessage('Listening…');
      try {
        recognition.start();
      } catch {
        setVoiceListening(false);
        speechRef.current = null;
        setQueuedMessage('Could not start voice input. Check microphone permission.');
      }
    };
    confirmUserAction('Start voice input?', 'Your browser’s speech service may process the audio. The transcript stays here; nothing is sent to the laptop until you review it and tap send.', 'Start listening', startListening);
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
      <Text style={[styles.commandHint, { color: colors.mutedForeground }]}>Commands are sent directly to your paired laptop on the local network. If it is offline, they remain in local history; tap Repeat after reconnecting. Use your keyboard’s mic for voice dictation in the native app.</Text>

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
