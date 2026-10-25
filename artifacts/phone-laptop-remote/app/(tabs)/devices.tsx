import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { Platform, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { Button, EmptyState, Header, IconButton, Screen, SectionTitle, StatusPill, Surface } from '@/components/RemoteUI';
import { useToast } from '@/components/Toast';
import { useColors } from '@/hooks/useColors';
import { useRemote } from '@/context/RemoteContext';
import { confirmUserAction } from '@/lib/userPrompt';

function formatChecked(value?: string) {
  if (!value) return 'Not checked yet';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Not checked yet';
  return `Checked ${date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
}

export default function DevicesScreen() {
  const colors = useColors();
  const router = useRouter();
  const toast = useToast();
  const {
    laptops,
    statuses,
    selectedLaptopId,
    selectLaptop,
    removeLaptop,
    checkConnection,
    checkAllConnections,
  } = useRemote();
  const [testing, setTesting] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const confirmRemove = (id: string, name: string) => confirmUserAction(
    'Remove computer?',
    `${name} and its saved pairing token will be removed from this phone.`,
    'Remove',
    () => removeLaptop(id),
  );

  const test = useCallback(async (id: string, name: string) => {
    setTesting(id);
    try {
      const status = await checkConnection(id);
      toast.show({
        kind: status.state === 'online' ? 'success' : 'error',
        title: status.state === 'online' ? `${name} is reachable` : `${name} did not answer`,
        message: status.state === 'online'
          ? `${status.latencyMs ? `Round trip ${status.latencyMs} ms · ` : ''}agent ready`
          : status.message,
      });
    } finally {
      setTesting(null);
    }
  }, [checkConnection, toast]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await checkAllConnections();
    } finally {
      setRefreshing(false);
    }
  }, [checkAllConnections]);

  return (
    <Screen
      bottomPadding={96}
      refreshControl={Platform.OS === 'web' ? undefined : (
        <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.primary} colors={[colors.primary]} />
      )}
    >
      <Header
        title="Devices"
        subtitle="Paired Windows computers"
        right={<IconButton icon="plus" label="Pair a computer" onPress={() => router.push('/pair')} tone="primary" />}
      />

      <Surface style={styles.secureCard}>
        <View style={[styles.secureIcon, { backgroundColor: colors.accent }]}>
          <Feather name="shield" size={18} color={colors.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.secureTitle, { color: colors.foreground }]}>Private by default</Text>
          <Text style={[styles.secureBody, { color: colors.mutedForeground }]}>
            Paired tokens stay on this phone and every request goes straight to your own network. Pull down to check every computer at once.
          </Text>
        </View>
      </Surface>

      <SectionTitle title={`${laptops.length} ${laptops.length === 1 ? 'computer' : 'computers'}`} caption="Tap a computer to make it active" />

      {laptops.length ? laptops.map((laptop) => {
        const status = statuses[laptop.id] ?? { state: 'offline' as const };
        const active = selectedLaptopId === laptop.id;
        return (
          <Surface key={laptop.id} style={[styles.deviceCard, active && { borderColor: colors.primary }]}>
            <Pressable
              testID={`select-${laptop.id}`}
              accessibilityRole="button"
              accessibilityLabel={`Make ${laptop.name} the active computer`}
              onPress={() => { void selectLaptop(laptop.id); }}
              style={styles.deviceMain}
            >
              <View style={[styles.deviceIcon, { backgroundColor: active ? colors.accent : colors.surfaceRaised }]}>
                <Feather name="monitor" size={20} color={active ? colors.primary : colors.mutedForeground} />
              </View>
              <View style={{ flex: 1 }}>
                <View style={styles.nameRow}>
                  <Text style={[styles.deviceName, { color: colors.foreground }]} numberOfLines={1}>{laptop.name}</Text>
                  {active ? (
                    <View style={[styles.activeChip, { backgroundColor: `${colors.primary}1C`, borderColor: `${colors.primary}55` }]}>
                      <Text style={[styles.activeChipText, { color: colors.primary }]}>ACTIVE</Text>
                    </View>
                  ) : null}
                </View>
                <Text style={[styles.deviceHost, { color: colors.mutedForeground }]} numberOfLines={1}>
                  {laptop.scheme ? `${laptop.scheme}://` : ''}{laptop.host}:{laptop.port} · {laptop.os}
                </Text>
                <View style={styles.statusRow}>
                  <StatusPill
                    status={status.state === 'connecting' ? 'connecting' : status.state === 'online' ? 'online' : 'offline'}
                    label={status.state === 'online' ? (status.latencyMs ? `ONLINE · ${status.latencyMs} MS` : 'ONLINE') : undefined}
                  />
                  <Text style={[styles.checked, { color: colors.mutedForeground }]} numberOfLines={1}>
                    {formatChecked(status.checkedAt)}
                  </Text>
                </View>
              </View>
            </Pressable>
            <View style={[styles.deviceActions, { borderTopColor: colors.border }]}>
              <Pressable
                accessibilityRole="button"
                onPress={() => { void test(laptop.id, laptop.name); }}
                disabled={testing === laptop.id}
                style={({ pressed }) => [styles.action, { opacity: testing === laptop.id || pressed ? 0.6 : 1 }]}
              >
                <Feather name={testing === laptop.id ? 'loader' : 'zap'} size={14} color={colors.primary} />
                <Text style={[styles.actionText, { color: colors.primary }]}>{testing === laptop.id ? 'Testing…' : 'Test connection'}</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                onPress={() => router.push({ pathname: '/pair', params: { editId: laptop.id } })}
                style={({ pressed }) => [styles.action, { opacity: pressed ? 0.6 : 1 }]}
              >
                <Feather name="edit-2" size={14} color={colors.primary} />
                <Text style={[styles.actionText, { color: colors.primary }]}>Edit</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                onPress={() => confirmRemove(laptop.id, laptop.name)}
                style={({ pressed }) => [styles.action, { opacity: pressed ? 0.6 : 1 }]}
              >
                <Feather name="trash-2" size={14} color={colors.destructive} />
                <Text style={[styles.actionText, { color: colors.destructive }]}>Remove</Text>
              </Pressable>
            </View>
          </Surface>
        );
      }) : (
        <EmptyState
          icon="monitor"
          title="No paired computers"
          body="Run the Windows agent on your laptop, then add its address and the six-digit code it prints."
          action={{ label: 'Pair a computer', onPress: () => router.push('/pair') }}
        />
      )}

      <Button
        label="Pair another computer"
        icon="link"
        onPress={() => router.push('/pair')}
        style={{ marginTop: 16 }}
      />
      <Text style={[styles.footer, { color: colors.mutedForeground }]}>
        Restarting the agent clears its tokens. If a computer shows offline, start the agent again and pair it once more.
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  secureCard: { flexDirection: 'row', gap: 12, alignItems: 'center', padding: 14 },
  secureIcon: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  secureTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 13 },
  secureBody: { fontFamily: 'Inter_400Regular', fontSize: 11, lineHeight: 16, marginTop: 3 },
  deviceCard: { padding: 0, overflow: 'hidden', marginBottom: 10 },
  deviceMain: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, padding: 15 },
  deviceIcon: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  deviceName: { fontFamily: 'Inter_600SemiBold', fontSize: 15, flexShrink: 1 },
  activeChip: { borderRadius: 99, borderWidth: 1, paddingHorizontal: 6, paddingVertical: 2 },
  activeChipText: { fontFamily: 'Inter_700Bold', fontSize: 8.5, letterSpacing: 0.6 },
  deviceHost: { fontFamily: 'Inter_400Regular', fontSize: 10.5, marginTop: 4 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 9, flexWrap: 'wrap' },
  checked: { fontFamily: 'Inter_400Regular', fontSize: 9.5, flexShrink: 1 },
  deviceActions: { borderTopWidth: 1, flexDirection: 'row', paddingVertical: 10, paddingHorizontal: 15, gap: 18, flexWrap: 'wrap' },
  action: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  actionText: { fontFamily: 'Inter_600SemiBold', fontSize: 10.5 },
  footer: { fontFamily: 'Inter_400Regular', fontSize: 10, lineHeight: 15, marginTop: 12, textAlign: 'center' },
});
