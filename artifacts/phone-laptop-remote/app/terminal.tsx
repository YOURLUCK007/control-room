import { Feather } from '@expo/vector-icons';
import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Header, Screen, SectionTitle, Surface } from '@/components/RemoteUI';
import { useColors } from '@/hooks/useColors';
import { useRemote } from '@/context/RemoteContext';
import { sendAgentAction } from '@/lib/agentClient';
import { confirmUserAction } from '@/lib/userPrompt';

type TerminalOutput = {
  message: string;
  exit_code?: number;
  stdout?: string;
  stderr?: string;
  timed_out?: boolean;
  truncated?: boolean;
};

export default function TerminalScreen() {
  const colors = useColors();
  const { selectedLaptop, settings } = useRemote();
  const [command, setCommand] = useState('');
  const [output, setOutput] = useState<TerminalOutput | null>(null);
  const [busy, setBusy] = useState(false);

  const runCommand = () => {
    const exactCommand = command.trim();
    if (!exactCommand || busy) return;
    if (!selectedLaptop?.token) {
      setOutput({ message: 'Pair the Windows agent first. Nothing was run.' });
      return;
    }
    confirmUserAction(
      'Run this on your laptop?',
      `${exactCommand}\n\nThis runs as your Windows user. It can change or delete files. Each command needs your confirmation.`,
      'Run command',
      async () => {
        setBusy(true);
        setOutput(null);
        try {
          const response = await sendAgentAction(selectedLaptop.host, selectedLaptop.port, selectedLaptop.token!, 'RUN_COMMAND', { command: exactCommand }, true, settings.localOnly);
          const data = response.data ?? {};
          setOutput({
            message: response.message,
            exit_code: typeof data.exit_code === 'number' ? data.exit_code : undefined,
            stdout: typeof data.stdout === 'string' ? data.stdout : undefined,
            stderr: typeof data.stderr === 'string' ? data.stderr : undefined,
            timed_out: data.timed_out === true,
            truncated: data.truncated === true,
          });
        } catch (error) {
          setOutput({ message: error instanceof Error ? error.message : 'The laptop could not be reached. Nothing was run.' });
        } finally {
          setBusy(false);
        }
      },
    );
  };

  return (
    <Screen>
      <Header title="Remote terminal" subtitle={selectedLaptop?.name ?? 'No laptop paired'} back />
      <Surface style={styles.warning}>
        <Feather name="alert-triangle" size={18} color={colors.warning} />
        <Text style={[styles.warningText, { color: colors.mutedForeground }]}>Commands run in PowerShell as your Windows user, from your home folder. Every run shows the exact command for confirmation; the agent stops waiting after 20 seconds. Never expose its port to the public internet.</Text>
      </Surface>
      <SectionTitle title="PowerShell command" />
      <TextInput
        testID="terminal-command"
        value={command}
        onChangeText={setCommand}
        placeholder={'Get-ChildItem\nGet-ComputerInfo | Select-Object CsName, WindowsVersion'}
        placeholderTextColor={colors.mutedForeground}
        multiline
        maxLength={1200}
        autoCapitalize="none"
        autoCorrect={false}
        textAlignVertical="top"
        style={[styles.commandEditor, { color: colors.foreground, backgroundColor: colors.card, borderColor: colors.border }]}
      />
      <Pressable testID="run-terminal-command" disabled={busy || !command.trim()} onPress={runCommand} style={[styles.runButton, { backgroundColor: colors.primary, opacity: busy || !command.trim() ? 0.5 : 1 }]}>
        <Feather name="play" size={16} color={colors.primaryForeground} />
        <Text style={[styles.runText, { color: colors.primaryForeground }]}>{busy ? 'Waiting for laptop…' : 'Review and run'}</Text>
      </Pressable>

      <SectionTitle title="Output" />
      <Surface style={styles.outputCard}>
        {output ? <>
          <View style={styles.outputHeader}>
            <Text style={[styles.outputMessage, { color: output.exit_code === undefined || output.exit_code === 0 ? colors.foreground : colors.destructive }]}>{output.message}</Text>
            {output.exit_code !== undefined ? <Text style={[styles.exitCode, { color: output.exit_code === 0 ? colors.success : colors.destructive }]}>exit {output.exit_code}</Text> : null}
          </View>
          {output.timed_out ? <Text style={[styles.outputHint, { color: colors.warning }]}>Stopped waiting after 20 seconds. The command may have started background work.</Text> : null}
          {output.stdout ? <Text selectable style={[styles.outputText, { color: colors.foreground }]}>{output.stdout}</Text> : null}
          {output.stderr ? <Text selectable style={[styles.outputText, { color: colors.destructive }]}>{output.stderr}</Text> : null}
          {output.truncated ? <Text style={[styles.outputHint, { color: colors.mutedForeground }]}>Output was shortened to the most recent lines.</Text> : null}
          {!output.stdout && !output.stderr ? <Text style={[styles.outputHint, { color: colors.mutedForeground }]}>No text output.</Text> : null}
        </> : <Text style={[styles.outputHint, { color: colors.mutedForeground }]}>The result from your last confirmed command appears here. Terminal commands are not saved in history.</Text>}
      </Surface>
    </Screen>
  );
}

const styles = StyleSheet.create({
  warning: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, padding: 13 },
  warningText: { flex: 1, fontSize: 11, lineHeight: 16, fontFamily: 'Inter_400Regular' },
  commandEditor: { minHeight: 130, maxHeight: 260, borderWidth: 1, borderRadius: 15, padding: 13, fontSize: 12, lineHeight: 18, fontFamily: 'Inter_400Regular' },
  runButton: { height: 47, borderRadius: 13, marginTop: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  runText: { fontSize: 12, fontFamily: 'Inter_600SemiBold' },
  outputCard: { minHeight: 84, padding: 13 },
  outputHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  outputMessage: { flex: 1, fontSize: 12, fontFamily: 'Inter_600SemiBold' },
  exitCode: { fontSize: 10, fontFamily: 'Inter_700Bold' },
  outputText: { fontSize: 11, lineHeight: 16, fontFamily: 'monospace', marginTop: 10 },
  outputHint: { fontSize: 11, lineHeight: 16, fontFamily: 'Inter_400Regular' },
});
