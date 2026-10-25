import { Feather } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Button, Header, IconButton, Screen, SectionTitle, StatusPill, Surface } from '@/components/RemoteUI';
import { useToast } from '@/components/Toast';
import { useColors } from '@/hooks/useColors';
import { useRemote } from '@/context/RemoteContext';

function ToggleRow({
  icon,
  title,
  body,
  value,
  onChange,
  last = false,
}: {
  icon: keyof typeof Feather.glyphMap;
  title: string;
  body: string;
  value: boolean;
  onChange: (next: boolean) => void;
  last?: boolean;
}) {
  const colors = useColors();
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityState={{ checked: value }}
      onPress={() => onChange(!value)}
      style={({ pressed }) => [
        styles.toggleRow,
        { borderBottomColor: colors.border, borderBottomWidth: last ? 0 : 1, opacity: pressed ? 0.7 : 1 },
      ]}
    >
      <View style={[styles.settingIcon, { backgroundColor: colors.surfaceRaised }]}>
        <Feather name={icon} size={15} color={value ? colors.primary : colors.mutedForeground} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.settingTitle, { color: colors.foreground }]}>{title}</Text>
        <Text style={[styles.settingBody, { color: colors.mutedForeground }]}>{body}</Text>
      </View>
      <View style={[styles.toggle, { backgroundColor: value ? colors.primary : colors.muted, borderColor: value ? colors.primary : colors.border }]}>
        <View style={[styles.toggleKnob, { backgroundColor: value ? colors.primaryForeground : colors.mutedForeground, transform: [{ translateX: value ? 14 : 0 }] }]} />
      </View>
    </Pressable>
  );
}

export default function SettingsScreen() {
  const colors = useColors();
  const router = useRouter();
  const toast = useToast();
  const { settings, updateSettings, selectedLaptop, selectedStatus, checkConnection } = useRemote();
  const [checking, setChecking] = useState(false);

  const check = async () => {
    if (!selectedLaptop) {
      router.push('/devices');
      return;
    }
    setChecking(true);
    const status = await checkConnection(selectedLaptop.id);
    setChecking(false);
    toast.show({
      kind: status.state === 'online' ? 'success' : 'error',
      title: status.state === 'online' ? 'Connection healthy' : 'Laptop unreachable',
      message: status.state === 'online' ? `${status.latencyMs ?? '—'} ms round trip` : status.message,
    });
  };

  const version = Constants.expoConfig?.version ?? '1.0.0';

  return (
    <Screen>
      <Header
        title="Settings"
        subtitle="Safety and connection preferences"
        back
        right={<IconButton icon="monitor" label="Devices" onPress={() => router.push('/devices')} />}
      />

      <Surface style={styles.trustCard}>
        <View style={[styles.trustIcon, { backgroundColor: colors.accent }]}>
          <Feather name="lock" size={18} color={colors.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.trustTitle, { color: colors.foreground }]}>Your control room stays local</Text>
          <Text style={[styles.trustBody, { color: colors.mutedForeground }]}>
            No account, no relay. Commands go from this phone straight to your paired agent.
          </Text>
        </View>
      </Surface>

      <SectionTitle title="Confirmation policy" />
      <Surface style={styles.settingsCard}>
        <ToggleRow
          icon="alert-circle"
          title="Confirm sensitive commands"
          body="Ask before shutdown, restart, delete, or sleep requests."
          value={settings.confirmCommands}
          onChange={(value) => { void updateSettings({ confirmCommands: value }); }}
          last
        />
      </Surface>

      <SectionTitle title="Security" />
      <Surface style={styles.settingsCard}>
        <ToggleRow
          icon="wifi-off"
          title="Local-only mode"
          body="Block public hosts. When off, non-local hosts must still use https://."
          value={settings.localOnly}
          onChange={(value) => { void updateSettings({ localOnly: value }); }}
          last
        />
      </Surface>

      <SectionTitle title="Connection" action="Manage" onAction={() => router.push('/devices')} />
      <Surface style={styles.connectionCard}>
        <View style={styles.connectionRow}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.connectionName, { color: colors.foreground }]}>{selectedLaptop?.name ?? 'No computer paired'}</Text>
            <Text style={[styles.connectionHost, { color: colors.mutedForeground }]} numberOfLines={1}>
              {selectedLaptop
                ? `${selectedLaptop.scheme ? `${selectedLaptop.scheme}://` : ''}${selectedLaptop.host}:${selectedLaptop.port}`
                : 'Pair a Windows agent to get started'}
            </Text>
          </View>
          <StatusPill
            status={selectedStatus.state === 'connecting' ? 'connecting' : selectedStatus.state === 'online' ? 'online' : 'offline'}
          />
        </View>
        <View style={styles.connectionAction}>
          <Button
            label={checking ? 'Checking…' : selectedLaptop ? 'Check connection now' : 'Pair a computer'}
            icon={selectedLaptop ? 'zap' : 'link'}
            variant="secondary"
            loading={checking}
            onPress={() => { void check(); }}
            style={{ flex: 1 }}
          />
        </View>
      </Surface>

      <SectionTitle title="About this build" />
      <Surface style={styles.about}>
        <View style={styles.aboutLine}>
          <Text style={[styles.aboutLabel, { color: colors.mutedForeground }]}>Version</Text>
          <Text style={[styles.aboutValue, { color: colors.foreground }]}>{version}</Text>
        </View>
        <View style={styles.aboutLine}>
          <Text style={[styles.aboutLabel, { color: colors.mutedForeground }]}>Transport</Text>
          <Text style={[styles.aboutValue, { color: colors.foreground }]}>LAN · TLS when available</Text>
        </View>
        <View style={styles.aboutLine}>
          <Text style={[styles.aboutLabel, { color: colors.mutedForeground }]}>Authentication</Text>
          <Text style={[styles.aboutValue, { color: colors.foreground }]}>One-time code + bearer token</Text>
        </View>
        <View style={styles.aboutLine}>
          <Text style={[styles.aboutLabel, { color: colors.mutedForeground }]}>Stored on this phone</Text>
          <Text style={[styles.aboutValue, { color: colors.foreground }]}>Devices, tokens, history</Text>
        </View>
      </Surface>
      <Text style={[styles.footer, { color: colors.mutedForeground }]}>
        Keep the agent private to your own network. A fully shut-down laptop cannot answer; wake-on-LAN is not supported.
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  trustCard: { flexDirection: 'row', gap: 12, alignItems: 'center', padding: 14 },
  trustIcon: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  trustTitle: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  trustBody: { fontSize: 11, lineHeight: 16, fontFamily: 'Inter_400Regular', marginTop: 3 },
  settingsCard: { paddingVertical: 0, paddingHorizontal: 14, overflow: 'hidden' },
  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: 11, paddingVertical: 14 },
  settingIcon: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  settingTitle: { fontSize: 12.5, fontFamily: 'Inter_600SemiBold' },
  settingBody: { fontSize: 10, lineHeight: 15, fontFamily: 'Inter_400Regular', marginTop: 3, paddingRight: 6 },
  toggle: { width: 40, height: 24, borderWidth: 1, borderRadius: 99, padding: 3, justifyContent: 'center' },
  toggleKnob: { width: 16, height: 16, borderRadius: 99 },
  connectionCard: { padding: 14 },
  connectionRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  connectionName: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  connectionHost: { fontSize: 10.5, fontFamily: 'Inter_400Regular', marginTop: 4 },
  connectionAction: { flexDirection: 'row', marginTop: 13 },
  about: { gap: 12, padding: 14 },
  aboutLine: { flexDirection: 'row', justifyContent: 'space-between', gap: 10 },
  aboutLabel: { fontSize: 11, fontFamily: 'Inter_400Regular' },
  aboutValue: { fontSize: 11, fontFamily: 'Inter_600SemiBold', textAlign: 'right', flex: 1 },
  footer: { fontSize: 10, lineHeight: 15, fontFamily: 'Inter_400Regular', marginTop: 14, textAlign: 'center', paddingHorizontal: 4 },
});
