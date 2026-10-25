import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { EmptyState, Header, IconButton, Screen, StatusPill, Surface } from '@/components/RemoteUI';
import { useToast } from '@/components/Toast';
import { useColors } from '@/hooks/useColors';
import { useRemote } from '@/context/RemoteContext';
import { confirmUserAction } from '@/lib/userPrompt';

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'sent', label: 'Sent' },
  { key: 'failed', label: 'Failed' },
  { key: 'offline', label: 'Local' },
] as const;

type FilterKey = typeof FILTERS[number]['key'];

function resultLabel(result: string) {
  return ({ sent: 'SENT', offline: 'LOCAL ONLY', queued: 'QUEUED', failed: 'FAILED', confirmation: 'CONFIRM' } as Record<string, string>)[result] ?? 'UNKNOWN';
}

function dayLabel(iso: string) {
  const date = new Date(iso);
  const today = new Date();
  const yesterday = new Date(today.getTime() - 86_400_000);
  if (date.toDateString() === today.toDateString()) return 'Today';
  if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

export default function HistoryScreen() {
  const colors = useColors();
  const router = useRouter();
  const toast = useToast();
  const { commands, queueCommand, clearHistory } = useRemote();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<FilterKey>('all');

  const filtered = useMemo(() => commands.filter((item) => {
    const matchesQuery = item.text.toLowerCase().includes(query.trim().toLowerCase());
    const matchesFilter = filter === 'all'
      ? true
      : filter === 'failed'
        ? item.result === 'failed'
        : filter === 'offline'
          ? item.result === 'offline' || item.result === 'queued'
          : item.result === filter;
    return matchesQuery && matchesFilter;
  }), [commands, filter, query]);

  const clear = () => confirmUserAction('Clear history?', 'All locally saved commands will be removed from this phone.', 'Clear history', async () => {
    await clearHistory();
    toast.show({ kind: 'success', title: 'History cleared' });
  });

  const repeat = async (text: string, confirmed = false) => {
    const response = await queueCommand(text, confirmed);
    if (response.requires_confirmation && !confirmed) {
      confirmUserAction('This needs confirmation', `${response.message}\n\n${text}`, 'Send anyway', () => { void repeat(text, true); });
      return;
    }
    toast.show({
      kind: response.result === 'sent' ? 'success' : response.result === 'confirmation' ? 'info' : 'error',
      title: response.result === 'sent' ? 'Sent again' : 'Command not completed',
      message: response.message,
    });
  };

  return (
    <Screen>
      <Header
        title="History"
        subtitle="Commands saved on this phone"
        back
        right={commands.length ? <IconButton icon="trash-2" label="Clear command history" onPress={clear} /> : undefined}
      />

      <View style={[styles.search, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Feather name="search" size={16} color={colors.mutedForeground} />
        <TextInput
          testID="history-search"
          value={query}
          onChangeText={setQuery}
          placeholder="Search commands"
          placeholderTextColor={colors.mutedForeground}
          style={[styles.searchInput, { color: colors.foreground }]}
          autoCorrect={false}
        />
        {query ? (
          <Pressable accessibilityLabel="Clear search" onPress={() => setQuery('')} hitSlop={8}>
            <Feather name="x" size={15} color={colors.mutedForeground} />
          </Pressable>
        ) : (
          <Text style={[styles.count, { color: colors.mutedForeground }]}>{filtered.length}</Text>
        )}
      </View>

      <View style={styles.filters}>
        {FILTERS.map((item) => {
          const active = filter === item.key;
          return (
            <Pressable
              key={item.key}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              onPress={() => setFilter(item.key)}
              style={[styles.filterChip, { backgroundColor: active ? colors.accent : colors.card, borderColor: active ? colors.primary : colors.border }]}
            >
              <Text style={[styles.filterText, { color: active ? colors.primary : colors.mutedForeground }]}>{item.label}</Text>
            </Pressable>
          );
        })}
      </View>

      {filtered.length ? filtered.map((item, index) => {
        const showDay = index === 0 || dayLabel(item.createdAt) !== dayLabel(filtered[index - 1].createdAt);
        return (
          <View key={item.id}>
            {showDay ? <Text style={[styles.dayLabel, { color: colors.mutedForeground }]}>{dayLabel(item.createdAt)}</Text> : null}
            <Surface style={styles.commandCard}>
              <View style={[styles.commandIcon, { backgroundColor: colors.surfaceRaised }]}>
                <Feather name="terminal" size={14} color={colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.commandText, { color: colors.foreground }]}>{item.text}</Text>
                <Text style={[styles.meta, { color: colors.mutedForeground }]}>
                  {new Date(item.createdAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                </Text>
                <View style={styles.result}>
                  <StatusPill status={item.result === 'sent' ? 'online' : 'offline'} label={resultLabel(item.result)} />
                </View>
              </View>
              <Pressable
                accessibilityLabel={`Repeat ${item.text}`}
                accessibilityRole="button"
                onPress={() => { void repeat(item.text); }}
                style={({ pressed }) => [styles.repeat, { borderColor: colors.border, opacity: pressed ? 0.6 : 1 }]}
              >
                <Feather name="rotate-cw" size={14} color={colors.primary} />
                <Text style={[styles.repeatText, { color: colors.primary }]}>Repeat</Text>
              </Pressable>
            </Surface>
          </View>
        );
      }) : (
        <EmptyState
          icon={query || filter !== 'all' ? 'search' : 'inbox'}
          title={query || filter !== 'all' ? 'No matching commands' : 'Nothing here yet'}
          body={query || filter !== 'all' ? 'Try a different search or filter.' : 'Commands you send from the control room are saved here.'}
          action={query || filter !== 'all'
            ? { label: 'Reset filters', onPress: () => { setQuery(''); setFilter('all'); } }
            : { label: 'Write a command', onPress: () => router.back() }}
        />
      )}
      <View style={{ height: 12 }} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  search: { borderWidth: 1, minHeight: 48, borderRadius: 15, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 13, gap: 9 },
  searchInput: { flex: 1, fontSize: 13, fontFamily: 'Inter_400Regular' },
  count: { fontSize: 11, fontFamily: 'Inter_600SemiBold' },
  filters: { flexDirection: 'row', gap: 7, marginTop: 12 },
  filterChip: { borderWidth: 1, borderRadius: 11, paddingHorizontal: 12, paddingVertical: 7 },
  filterText: { fontSize: 10.5, fontFamily: 'Inter_600SemiBold' },
  dayLabel: { fontSize: 10, fontFamily: 'Inter_700Bold', letterSpacing: 1, marginTop: 16, marginBottom: 2 },
  commandCard: { flexDirection: 'row', gap: 11, alignItems: 'flex-start', padding: 14, marginTop: 8 },
  commandIcon: { width: 30, height: 30, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  commandText: { fontSize: 12.5, fontFamily: 'Inter_600SemiBold', lineHeight: 18 },
  meta: { fontSize: 9.5, fontFamily: 'Inter_400Regular', marginTop: 5 },
  result: { marginTop: 8, alignSelf: 'flex-start' },
  repeat: { flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1, borderRadius: 10, paddingVertical: 7, paddingHorizontal: 8 },
  repeatText: { fontSize: 10, fontFamily: 'Inter_600SemiBold' },
});
