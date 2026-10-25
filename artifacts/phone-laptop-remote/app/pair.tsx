import { Feather } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput, View } from 'react-native';
import { Button, Header, Screen, SectionTitle, Surface } from '@/components/RemoteUI';
import { useToast } from '@/components/Toast';
import { useColors } from '@/hooks/useColors';
import { useRemote } from '@/context/RemoteContext';
import { isPrivateLanHost } from '@/lib/agentClient';

export default function PairScreen() {
  const colors = useColors();
  const router = useRouter();
  const toast = useToast();
  const { editId } = useLocalSearchParams<{ editId?: string }>();
  const { laptops, pairLaptop, updateLaptop, settings } = useRemote();
  const editKey = typeof editId === 'string' ? editId : undefined;
  const existing = useMemo(() => laptops.find((item) => item.id === editKey), [editKey, laptops]);
  const [name, setName] = useState(existing?.name ?? '');
  const [host, setHost] = useState(existing?.host ?? '');
  const [port, setPort] = useState(String(existing?.port ?? 8765));
  const [os, setOs] = useState(existing?.os ?? 'Windows 11');
  const [pairingCode, setPairingCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setError('');
    if (!name.trim()) {
      setError('Give this computer a name you will recognise.');
      return;
    }
    if (!existing && (!host.trim() || !pairingCode.trim())) {
      setError('Enter the laptop address and the six-digit code from its agent window.');
      return;
    }
    const parsedPort = Number(port);
    if (!existing && (!Number.isInteger(parsedPort) || parsedPort < 1 || parsedPort > 65535)) {
      setError('Enter a valid port between 1 and 65535.');
      return;
    }
    if (!existing && pairingCode.trim().length !== 6) {
      setError('The pairing code is six digits — check the agent window.');
      return;
    }
    if (!existing && settings.localOnly && !isPrivateLanHost(host)) {
      setError('Local-only mode accepts private IP addresses or local computer names, not public internet hosts.');
      return;
    }

    if (existing) {
      setBusy(true);
      await updateLaptop(existing.id, { name: name.trim(), os: os.trim() || 'Windows' });
      setBusy(false);
      toast.show({ kind: 'success', title: 'Computer updated' });
      router.back();
      return;
    }

    setBusy(true);
    const pairingError = await pairLaptop({ name, host, port: parsedPort, code: pairingCode, os });
    setBusy(false);
    if (pairingError) {
      setError(pairingError);
      toast.show({ kind: 'error', title: 'Pairing failed', message: pairingError });
      return;
    }
    toast.show({ kind: 'success', title: 'Computer paired', message: 'The control room is ready.' });
    router.back();
  };

  return (
    <KeyboardAvoidingView style={styles.keyboard} behavior={Platform.OS === 'web' ? undefined : 'padding'}>
      <Screen>
        <Header
          title={existing ? 'Edit computer' : 'Pair computer'}
          subtitle={existing ? existing.host : 'Local agent connection'}
          back
        />

        <Surface style={styles.stepCard}>
          <View style={[styles.stepNumber, { backgroundColor: colors.accent, borderColor: colors.primary }]}>
            <Text style={[styles.stepNumberText, { color: colors.primary }]}>1</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.stepTitle, { color: colors.foreground }]}>
              {existing ? 'This pairing is already active' : 'Start the Windows agent'}
            </Text>
            <Text style={[styles.stepBody, { color: colors.mutedForeground }]}>
              {existing
                ? 'To change the address or port, remove this computer and pair again with a fresh code.'
                : 'Run agent.py on your laptop. Its window prints a six-digit code and the local address to enter here.'}
            </Text>
          </View>
        </Surface>

        <SectionTitle title="Agent details" caption={existing ? 'Name and label only' : 'From the agent window'} />
        <View style={[styles.formCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.inputLabel, { color: colors.mutedForeground }]}>DISPLAY NAME</Text>
          <TextInput
            testID="pair-name"
            value={name}
            onChangeText={setName}
            placeholder="Luna office"
            placeholderTextColor={colors.mutedForeground}
            style={[styles.input, { color: colors.foreground, borderBottomColor: colors.border }]}
            autoCapitalize="words"
            returnKeyType="next"
          />

          <Text style={[styles.inputLabel, { color: colors.mutedForeground }]}>LAPTOP ADDRESS</Text>
          <TextInput
            testID="pair-host"
            value={host}
            onChangeText={setHost}
            editable={!existing}
            placeholder="192.168.1.42"
            placeholderTextColor={colors.mutedForeground}
            style={[styles.input, { color: colors.foreground, borderBottomColor: colors.border, opacity: existing ? 0.6 : 1 }]}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            returnKeyType="next"
          />

          <Text style={[styles.inputLabel, { color: colors.mutedForeground }]}>PORT</Text>
          <TextInput
            testID="pair-port"
            value={port}
            onChangeText={setPort}
            editable={!existing}
            keyboardType="number-pad"
            placeholder="8765"
            placeholderTextColor={colors.mutedForeground}
            style={[styles.input, { color: colors.foreground, borderBottomColor: colors.border, opacity: existing ? 0.6 : 1 }]}
          />

          {!existing ? (
            <>
              <Text style={[styles.inputLabel, { color: colors.mutedForeground }]}>SIX-DIGIT CODE</Text>
              <TextInput
                testID="pair-code"
                value={pairingCode}
                onChangeText={(value) => setPairingCode(value.replace(/\D/g, '').slice(0, 6))}
                placeholder="123456"
                placeholderTextColor={colors.mutedForeground}
                style={[styles.codeInput, { color: colors.primary, borderBottomColor: colors.border }]}
                keyboardType="number-pad"
                maxLength={6}
                returnKeyType="done"
                onSubmitEditing={() => { void save(); }}
              />
            </>
          ) : null}

          <Text style={[styles.inputLabel, { color: colors.mutedForeground }]}>OPERATING SYSTEM</Text>
          <TextInput
            value={os}
            onChangeText={setOs}
            placeholder="Windows 11"
            placeholderTextColor={colors.mutedForeground}
            style={[styles.input, { color: colors.foreground, borderBottomColor: colors.border }]}
          />
        </View>

        {error ? (
          <View style={styles.error}>
            <Feather name="alert-circle" size={14} color={colors.destructive} />
            <Text style={[styles.errorText, { color: colors.destructive }]}>{error}</Text>
          </View>
        ) : null}

        <Button
          label={existing ? 'Save details' : 'Pair securely'}
          icon={existing ? 'check' : 'link'}
          loading={busy}
          onPress={() => { void save(); }}
          testID="save-pairing"
          style={{ marginTop: 18 }}
        />

        <View style={styles.helpRow}>
          <Feather name="info" size={13} color={colors.mutedForeground} />
          <Text style={[styles.footerNote, { color: colors.mutedForeground }]}>
            {settings.localOnly
              ? 'Local-only mode is on, so only private addresses like 192.168.x.x or a computer name will connect.'
              : 'Local-only mode is off. Non-local hosts must use an https:// address.'}
          </Text>
        </View>
        <Button
          label="Where do I find these?"
          variant="secondary"
          onPress={() => toast.show({
            kind: 'info',
            title: 'Find your laptop address',
            message: 'In PowerShell run ipconfig and look for the IPv4 Address on your Wi-Fi adapter. Keep the phone on the same Wi-Fi, then copy the agent’s six-digit code.',
            durationMs: 9000,
          })}
          style={{ marginTop: 10 }}
        />
        <Text style={[styles.footnote, { color: colors.mutedForeground }]}>
          The phone sends the code directly to the agent. Never port-forward the agent or expose it to the internet.
        </Text>
      </Screen>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  keyboard: { flex: 1 },
  stepCard: { flexDirection: 'row', gap: 12, alignItems: 'center', padding: 14 },
  stepNumber: { width: 30, height: 30, borderRadius: 10, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  stepNumberText: { fontSize: 13, fontFamily: 'Inter_700Bold' },
  stepTitle: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  stepBody: { fontSize: 10.5, lineHeight: 15.5, fontFamily: 'Inter_400Regular', marginTop: 3 },
  formCard: { borderWidth: 1, borderRadius: 18, paddingHorizontal: 15, paddingBottom: 6 },
  inputLabel: { fontSize: 9, fontFamily: 'Inter_700Bold', letterSpacing: 1, marginTop: 16 },
  input: { minHeight: 42, fontSize: 13.5, fontFamily: 'Inter_400Regular', borderBottomWidth: 1, paddingVertical: 7 },
  codeInput: { minHeight: 52, fontSize: 24, fontFamily: 'Inter_700Bold', letterSpacing: 8, borderBottomWidth: 1, paddingVertical: 6 },
  error: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginTop: 11 },
  errorText: { fontSize: 11, lineHeight: 16, fontFamily: 'Inter_500Medium', flex: 1 },
  helpRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 7, marginTop: 12 },
  footerNote: { fontSize: 10, lineHeight: 15, fontFamily: 'Inter_400Regular', flex: 1 },
  footnote: { textAlign: 'center', fontSize: 9.5, lineHeight: 14, fontFamily: 'Inter_400Regular', marginTop: 12, paddingHorizontal: 6 },
});
