import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Pressable, Share, StyleSheet, Text, TextInput, View } from 'react-native';
import { Button, EmptyState, Header, Screen, SectionTitle, Surface } from '@/components/RemoteUI';
import { useToast } from '@/components/Toast';
import { useColors } from '@/hooks/useColors';
import { useRemote } from '@/context/RemoteContext';
import { confirmUserAction } from '@/lib/userPrompt';

type TerminalOutput = {
  message: string;
  exit_code?: number;
  stdout?: string;
  stderr?: string;
  timed_out?: boolean;
  truncated?: boolean;
  success: boolean;
};

type RunRecord = {
  id: string;
  command: string;
  exitCode?: number;
  failed: boolean;
};

const MAX_COMMAND_CHARS = 1200;

const presets = [
  { label: 'List files', command: 'Get-ChildItem' },
  { label: 'IP config', command: 'ipconfig' },
  { label: 'Top processes', command: 'Get-Process | Sort-Object CPU -Descending | Select-Object -First 10 Name, CPU, WS' },
  { label: 'Battery', command: 'Get-CimInstance Win32_Battery | Select-Object EstimatedChargeRemaining, BatteryStatus' },
];

export default function TerminalScreen() {
  const colors = useColors();
  const router = useRouter();
  const toast = useToast();
  const { selectedLaptop, selectedStatus, runAction } = useRemote();
  const [command, setCommand] = useState('');
  const [output, setOutput] = useState<TerminalOutput | null>(null);
  const [history, setHistory] = useState<RunRecord[]>([]);
  const [busy, setBusy] = useState(false);

  const runCommand = () => {
    const exactCommand = command.trim();
    if (!exactCommand || busy) return;
    if (!selectedLaptop?.token) {
      toast.show({ kind: 'info', title: 'No laptop paired', message: 'Pair the Windows agent before running commands.' });
      router.push('/pair');
      return;
    }
    confirmUserAction(
      'Run this on your laptop?',
      `${exactCommand}\n\nThis runs as your Windows user and can change or delete files. Every command needs your confirmation.`,
      'Run command',
      async () => {
        setBusy(true);
        setOutput(null);
        const response = await runAction('RUN_COMMAND', { command: exactCommand }, true);
        const data = response.data ?? {};
        const next: TerminalOutput = {
          success: response.success,
          message: response.message,
          exit_code: typeof data.exit_code === 'number' ? data.exit_code : undefined,
          stdout: typeof data.stdout === 'string' ? data.stdout : undefined,
          stderr: typeof data.stderr === 'string' ? data.stderr : undefined,
          timed_out: data.timed_out === true,
          truncated: data.truncated === true,
        };
        setOutput(next);
        setBusy(false);
        setHistory((prev) => [
          { id: `${Date.now()}`, command: exactCommand, exitCode: next.exit_code, failed: !next.success },
          ...prev,
        ].slice(0, 6));
        toast.show({
          kind: response.success ? 'success' : 'error',
          title: response.success ? 'Command completed' : 'Command failed',
          message: next.exit_code !== undefined ? response.message : response.message,
        });
      },
    );
  };

  const shareOutput = async () => {
    if (!output) return;
    const body = [
      command.trim() || history[0]?.command || 'Remote command',
      '',
      output.message,
      output.stdout ?? '',
      output.stderr ?? '',
    ].filter(Boolean).join('\n').slice(0, 6000);
    try {
      await Share.share({ message: body });
    } catch {
      toast.show({ kind: 'error', title: 'Could not open the share sheet' });
    }
  };

  if (!selectedLaptop) {
    return (
      <Screen bottomPadding={96}>
        <Header title="Terminal" subtitle="Confirmed PowerShell" />
        <EmptyState
          icon="terminal"
          title="Pair a computer first"
          body="The remote terminal runs PowerShell on your paired laptop. Every command is shown for confirmation before it runs."
          action={{ label: 'Pair a computer', onPress: () => router.push('/pair') }}
        />
      </Screen>
    );
  }

  const dirty = command.trim().length > 0;

  return (
    <Screen bottomPadding={96}>
      <Header title="Terminal" subtitle={`${selectedLaptop.name} · ${selectedStatus.state === 'online' ? 'online' : 'offline'}`} />

      <Surface style={styles.warning}>
        <Feather name="alert-triangle" size={17} color={colors.warning} />
        <Text style={[styles.warningText, { color: colors.mutedForeground }]}>
          Runs in PowerShell as your Windows user from your home folder. Each command waits up to 20 seconds and returns trimmed output. Never expose the agent port to the internet.
        </Text>
      </Surface>

      <SectionTitle title="PowerShell command" caption={`${command.length}/${MAX_COMMAND_CHARS} characters`} />
      <TextInput
        testID="terminal-command"
        value={command}
        onChangeText={setCommand}
        placeholder={'Get-ChildItem\nGet-ComputerInfo | Select-Object CsName, WindowsVersion'}
        placeholderTextColor={colors.mutedForeground}
        multiline
        maxLength={MAX_COMMAND_CHARS}
        autoCapitalize="none"
        autoCorrect={false}
        textAlignVertical="top"
        style={[styles.commandEditor, { color: colors.foreground, backgroundColor: colors.card, borderColor: colors.border }]}
      />
      <View style={styles.runRow}>
        <Button
          label={busy ? 'Waiting for laptop…' : 'Review and run'}
          icon={busy ? undefined : 'play'}
          loading={busy}
          disabled={!dirty}
          onPress={runCommand}
          testID="run-terminal-command"
          style={{ flex: 1 }}
        />
        <Button label="Clear" variant="secondary" disabled={!dirty && !output} onPress={() => { setCommand(''); setOutput(null); }} />
      </View>

      <SectionTitle title="Quick commands" caption="Tap to load, then review" />
      <View style={styles.presetRow}>
        {presets.map((preset) => (
          <Pressable
            key={preset.label}
            accessibilityRole="button"
            onPress={() => setCommand(preset.command)}
            style={({ pressed }) => [styles.preset, { backgroundColor: colors.card, borderColor: colors.border, opacity: pressed ? 0.65 : 1 }]}
          >
            <Feather name="chevron-right" size={12} color={colors.primary} />
            <Text style={[styles.presetText, { color: colors.foreground }]}>{preset.label}</Text>
          </Pressable>
        ))}
      </View>

      <SectionTitle title="Output" action={output ? 'Share' : undefined} onAction={output ? () => { void shareOutput(); } : undefined} />
      <Surface style={styles.outputCard}>
        {output ? (
          <>
            <View style={styles.outputHeader}>
              <Feather
                name={output.success ? 'check-circle' : 'alert-circle'}
                size={15}
                color={output.success ? colors.success : colors.destructive}
              />
              <Text style={[styles.outputMessage, { color: output.success ? colors.foreground : colors.destructive }]}>{output.message}</Text>
              {output.exit_code !== undefined ? (
                <Text style={[styles.exitCode, { color: output.exit_code === 0 ? colors.success : colors.destructive }]}>exit {output.exit_code}</Text>
              ) : null}
            </View>
            {output.timed_out ? (
              <Text style={[styles.outputHint, { color: colors.warning }]}>Stopped waiting after 20 seconds. The command may still be running on the laptop.</Text>
            ) : null}
            {output.stdout ? <Text selectable style={[styles.outputText, { color: colors.foreground }]}>{output.stdout}</Text> : null}
            {output.stderr ? <Text selectable style={[styles.outputText, { color: colors.destructive }]}>{output.stderr}</Text> : null}
            {output.truncated ? (
              <Text style={[styles.outputHint, { color: colors.mutedForeground }]}>Output was shortened to the most recent lines.</Text>
            ) : null}
            {!output.stdout && !output.stderr ? (
              <Text style={[styles.outputHint, { color: colors.mutedForeground }]}>No text output.</Text>
            ) : null}
          </>
        ) : (
          <Text style={[styles.outputHint, { color: colors.mutedForeground }]}>
            {busy ? 'Running on your laptop…' : 'The result of your last confirmed command appears here. Terminal commands are not added to history.'}
          </Text>
        )}
      </Surface>

      {history.length ? (
        <>
          <SectionTitle title="This session" action="Clear" onAction={() => { setHistory([]); setOutput(null); }} caption="Reuse a command" />
          <Surface style={styles.historyCard}>
            {history.map((item, index) => (
              <Pressable
                key={item.id}
                accessibilityRole="button"
                onPress={() => setCommand(item.command)}
                style={[styles.historyRow, index > 0 && { borderTopWidth: 1, borderTopColor: colors.border }]}
              >
                <Feather name={item.failed ? 'x-circle' : 'check-circle'} size={13} color={item.failed ? colors.destructive : colors.success} />
                <Text style={[styles.historyText, { color: colors.foreground }]} numberOfLines={1}>{item.command}</Text>
                <Text style={[styles.historyExit, { color: colors.mutedForeground }]}>
                  {item.exitCode !== undefined ? `exit ${item.exitCode}` : 'run'}
                </Text>
              </Pressable>
            ))}
          </Surface>
        </>
      ) : null}
      <View style={{ height: 8 }} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  warning: { flexDirection: 'row', alignItems: 'flex-start', gap: 9, padding: 12 },
  warningText: { flex: 1, fontSize: 10.5, lineHeight: 15.5, fontFamily: 'Inter_400Regular' },
  commandEditor: {
    minHeight: 132,
    maxHeight: 280,
    borderWidth: 1,
    borderRadius: 15,
    padding: 13,
    fontSize: 12.5,
    lineHeight: 19,
    fontFamily: 'monospace',
  },
  runRow: { flexDirection: 'row', gap: 9, marginTop: 10 },
  presetRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  preset: { flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, borderRadius: 11, paddingHorizontal: 10, paddingVertical: 8 },
  presetText: { fontSize: 10.5, fontFamily: 'Inter_600SemiBold' },
  outputCard: { minHeight: 92, padding: 13 },
  outputHeader: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  outputMessage: { flex: 1, fontSize: 12, fontFamily: 'Inter_600SemiBold' },
  exitCode: { fontSize: 9.5, fontFamily: 'Inter_700Bold' },
  outputText: { fontSize: 11, lineHeight: 16, fontFamily: 'monospace', marginTop: 10 },
  outputHint: { fontSize: 10.5, lineHeight: 16, fontFamily: 'Inter_400Regular', marginTop: 8 },
  historyCard: { padding: 0, overflow: 'hidden' },
  historyRow: { flexDirection: 'row', alignItems: 'center', gap: 9, paddingVertical: 11, paddingHorizontal: 13 },
  historyText: { flex: 1, fontSize: 11, fontFamily: 'monospace' },
  historyExit: { fontSize: 9.5, fontFamily: 'Inter_500Medium' },
});
