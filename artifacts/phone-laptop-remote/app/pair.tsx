import { Feather } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Header, Screen, Surface } from '@/components/RemoteUI';
import { useColors } from '@/hooks/useColors';
import { useRemote } from '@/context/RemoteContext';
import { isPrivateLanHost } from '@/lib/agentClient';

export default function PairScreen() {
  const colors = useColors();
  const router = useRouter();
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

  const save = async () => {
    if (!name.trim() || !host.trim() || (!existing && !pairingCode.trim())) {
      setError(existing ? 'Add the computer name and host to continue.' : 'Add the computer name, host, and one-time pairing code to continue.');
      return;
    }
    const parsedPort = Number(port);
    if (!Number.isInteger(parsedPort) || parsedPort < 1 || parsedPort > 65535) {
      setError('Enter a valid port number.');
      return;
    }
    if (settings.localOnly && !isPrivateLanHost(host)) {
      setError('Local-only mode accepts private IP addresses or local computer names, not public internet hosts.');
      return;
    }
    if (existing) {
      await updateLaptop(existing.id, { name: name.trim(), os: os.trim() || 'Windows' });
      router.back();
      return;
    }
    const pairingError = await pairLaptop({ name, host, port: parsedPort, code: pairingCode, os });
    if (pairingError) {
      setError(pairingError);
      return;
    }
    router.back();
  };

  return <KeyboardAvoidingView style={styles.keyboard} behavior={Platform.OS === 'web' ? undefined : 'padding'}><Screen><Header title={existing ? 'Edit computer' : 'Pair computer'} subtitle="Local agent connection" back /><Surface style={styles.stepCard}><View style={[styles.stepNumber, { backgroundColor: colors.primary }]}><Text style={[styles.stepNumberText, { color: colors.primaryForeground }]}>1</Text></View><View style={{ flex: 1 }}><Text style={[styles.stepTitle, { color: colors.foreground }]}>{existing ? 'Update device label' : 'Start the Windows agent'}</Text><Text style={[styles.stepBody, { color: colors.mutedForeground }]}>{existing ? 'To change the host address, remove this saved pairing and pair again with a fresh code.' : 'Run the agent on your laptop. It prints a six-digit one-time code and a local address.'}</Text></View></Surface><Text style={[styles.formLabel, { color: colors.foreground }]}>Agent details</Text><View style={[styles.formCard, { backgroundColor: colors.card, borderColor: colors.border }]}><Text style={[styles.inputLabel, { color: colors.mutedForeground }]}>Display name</Text><TextInput testID="pair-name" value={name} onChangeText={setName} placeholder="e.g. Luna office" placeholderTextColor={colors.mutedForeground} style={[styles.input, { color: colors.foreground, borderBottomColor: colors.border }]} autoCapitalize="words" /><Text style={[styles.inputLabel, { color: colors.mutedForeground }]}>Windows host or HTTPS URL</Text><TextInput testID="pair-host" value={host} onChangeText={setHost} editable={!existing} placeholder="192.168.1.42 or https://host:8765" placeholderTextColor={colors.mutedForeground} style={[styles.input, { color: colors.foreground, borderBottomColor: colors.border, opacity: existing ? 0.65 : 1 }]} autoCapitalize="none" autoCorrect={false} /><Text style={[styles.inputLabel, { color: colors.mutedForeground }]}>Agent port</Text><TextInput testID="pair-port" value={port} onChangeText={setPort} editable={!existing} keyboardType="number-pad" placeholder="8765" placeholderTextColor={colors.mutedForeground} style={[styles.input, { color: colors.foreground, borderBottomColor: colors.border, opacity: existing ? 0.65 : 1 }]} />{!existing ? <><Text style={[styles.inputLabel, { color: colors.mutedForeground }]}>One-time code from laptop</Text><TextInput testID="pair-code" value={pairingCode} onChangeText={setPairingCode} placeholder="123456" placeholderTextColor={colors.mutedForeground} style={[styles.input, { color: colors.foreground, borderBottomColor: colors.border }]} keyboardType="number-pad" maxLength={6} /></> : null}<Text style={[styles.inputLabel, { color: colors.mutedForeground }]}>Operating system</Text><TextInput value={os} onChangeText={setOs} placeholder="Windows 11" placeholderTextColor={colors.mutedForeground} style={[styles.input, { color: colors.foreground }]} /></View>{error ? <View style={styles.error}><Feather name="alert-circle" size={14} color={colors.destructive} /><Text style={[styles.errorText, { color: colors.destructive }]}>{error}</Text></View> : null}<Pressable testID="save-pairing" onPress={save} style={({ pressed }) => [styles.save, { backgroundColor: colors.primary, opacity: pressed ? 0.7 : 1 }]}><Feather name={existing ? 'check' : 'link'} size={17} color={colors.primaryForeground} /><Text style={[styles.saveText, { color: colors.primaryForeground }]}>{existing ? 'Save details' : 'Pair securely'}</Text></Pressable><Text style={[styles.footerNote, { color: colors.mutedForeground }]}>The phone sends the code directly to the agent. Local-only mode is on by default; keep the agent private and never port-forward it.</Text></Screen></KeyboardAvoidingView>;
}

const styles = StyleSheet.create({
  keyboard: { flex: 1 },
  stepCard: { flexDirection: 'row', gap: 12, alignItems: 'center', padding: 15 },
  stepNumber: { width: 30, height: 30, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  stepNumberText: { fontSize: 13, fontFamily: 'Inter_700Bold' },
  stepTitle: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  stepBody: { fontSize: 11, lineHeight: 16, fontFamily: 'Inter_400Regular', marginTop: 3 },
  codeBlock: { alignItems: 'center', paddingVertical: 25 },
  codeLabel: { fontSize: 10, letterSpacing: 1.4, fontFamily: 'Inter_700Bold' },
  code: { fontSize: 31, letterSpacing: 3, fontFamily: 'Inter_700Bold', marginTop: 9 },
  codeNote: { fontSize: 11, fontFamily: 'Inter_400Regular', textAlign: 'center', marginTop: 8 },
  formLabel: { fontSize: 16, fontFamily: 'Inter_600SemiBold', marginBottom: 10 },
  formCard: { borderWidth: 1, borderRadius: 18, paddingHorizontal: 15 },
  inputLabel: { fontSize: 10, fontFamily: 'Inter_600SemiBold', marginTop: 15 },
  input: { minHeight: 43, fontSize: 13, fontFamily: 'Inter_400Regular', borderBottomWidth: 1, paddingVertical: 8 },
  error: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10 },
  errorText: { fontSize: 11, fontFamily: 'Inter_500Medium' },
  save: { height: 51, borderRadius: 15, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8, marginTop: 18 },
  saveText: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  footerNote: { textAlign: 'center', fontSize: 10, lineHeight: 15, fontFamily: 'Inter_400Regular', marginTop: 13, paddingHorizontal: 10 },
});