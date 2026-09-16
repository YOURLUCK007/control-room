import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Header, IconButton, Screen, StatusPill, Surface } from '@/components/RemoteUI';
import { useColors } from '@/hooks/useColors';
import { useRemote } from '@/context/RemoteContext';

export default function HistoryScreen() {
  const colors = useColors();
  const router = useRouter();
  const { commands, queueCommand, clearHistory } = useRemote();
  const [query, setQuery] = useState('');
  const [repeatMessage, setRepeatMessage] = useState('');
  const filtered = useMemo(() => commands.filter((item) => item.text.toLowerCase().includes(query.toLowerCase())), [commands, query]);

  const clear = () => Alert.alert('Clear history?', 'All locally saved commands will be removed from this phone.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Clear history', style: 'destructive', onPress: clearHistory }]);

  return <Screen><Header title="History" subtitle="Commands saved on this phone" back right={<IconButton icon="trash-2" label="Clear command history" onPress={clear} />} /><View style={[styles.search, { backgroundColor: colors.surface, borderColor: colors.border }]}><Feather name="search" size={17} color={colors.mutedForeground} /><TextInput testID="history-search" value={query} onChangeText={setQuery} placeholder="Search commands" placeholderTextColor={colors.mutedForeground} style={[styles.searchInput, { color: colors.foreground }]} /><Text style={[styles.count, { color: colors.mutedForeground }]}>{filtered.length}</Text></View>{repeatMessage ? <View style={styles.feedback}><Feather name="check-circle" size={14} color={colors.success} /><Text style={[styles.feedbackText, { color: colors.success }]}>{repeatMessage}</Text></View> : null}{filtered.length ? filtered.map((item) => <Surface key={item.id} style={styles.commandCard}><View style={[styles.commandIcon, { backgroundColor: colors.accent }]}><Feather name="terminal" size={16} color={colors.primary} /></View><View style={{ flex: 1 }}><Text style={[styles.commandText, { color: colors.foreground }]}>{item.text}</Text><Text style={[styles.meta, { color: colors.mutedForeground }]}>{new Date(item.createdAt).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</Text><View style={styles.result}><StatusPill status={item.result === 'sent' ? 'online' : 'offline'} label={item.result === 'sent' ? 'SENT' : 'OFFLINE · SAVED'} /></View></View><Pressable accessibilityLabel={`Repeat ${item.text}`} onPress={async () => { await queueCommand(item.text); setRepeatMessage('Command copied to the local queue.'); }} style={({ pressed }) => [styles.repeat, { borderColor: colors.border, opacity: pressed ? 0.65 : 1 }]}><Feather name="rotate-cw" size={15} color={colors.primary} /><Text style={[styles.repeatText, { color: colors.primary }]}>Repeat</Text></Pressable></Surface>) : <Surface style={styles.empty}><Feather name="search" size={22} color={colors.mutedForeground} /><Text style={[styles.emptyTitle, { color: colors.foreground }]}>{query ? 'No matching commands' : 'Nothing here yet'}</Text><Text style={[styles.emptyBody, { color: colors.mutedForeground }]}>{query ? 'Try a shorter search.' : 'Commands you queue from the control room will appear here.'}</Text>{!query ? <Pressable onPress={() => router.back()}><Text style={[styles.backText, { color: colors.primary }]}>Write a command</Text></Pressable> : null}</Surface>}</Screen>;
}

const styles = StyleSheet.create({
  search: { borderWidth: 1, minHeight: 48, borderRadius: 15, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, gap: 9 },
  searchInput: { flex: 1, fontSize: 13, fontFamily: 'Inter_400Regular' },
  count: { fontSize: 11, fontFamily: 'Inter_600SemiBold' },
  feedback: { flexDirection: 'row', gap: 6, alignItems: 'center', marginVertical: 12 },
  feedbackText: { fontSize: 11, fontFamily: 'Inter_500Medium' },
  commandCard: { flexDirection: 'row', gap: 11, alignItems: 'flex-start', padding: 14, marginTop: 10 },
  commandIcon: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  commandText: { fontSize: 13, fontFamily: 'Inter_600SemiBold', lineHeight: 18 },
  meta: { fontSize: 10, fontFamily: 'Inter_400Regular', marginTop: 5 },
  result: { marginTop: 8, alignSelf: 'flex-start' },
  repeat: { flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1, borderRadius: 10, paddingVertical: 7, paddingHorizontal: 8 },
  repeatText: { fontSize: 10, fontFamily: 'Inter_600SemiBold' },
  empty: { alignItems: 'center', gap: 8, paddingVertical: 32 },
  emptyTitle: { fontSize: 15, fontFamily: 'Inter_600SemiBold' },
  emptyBody: { fontSize: 12, lineHeight: 17, textAlign: 'center', maxWidth: 250, fontFamily: 'Inter_400Regular' },
  backText: { fontSize: 12, fontFamily: 'Inter_600SemiBold', marginTop: 7 },
});