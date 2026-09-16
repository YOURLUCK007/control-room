import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { Header, IconButton, Screen, SectionTitle, StatusPill, Surface } from '@/components/RemoteUI';
import { useColors } from '@/hooks/useColors';
import { useRemote } from '@/context/RemoteContext';

export default function DevicesScreen() {
  const colors = useColors();
  const router = useRouter();
  const { laptops, selectedLaptopId, selectLaptop, removeLaptop } = useRemote();

  const confirmRemove = (id: string, name: string) => Alert.alert('Remove computer?', `${name} will be removed from this phone.`, [{ text: 'Cancel', style: 'cancel' }, { text: 'Remove', style: 'destructive', onPress: () => removeLaptop(id) }]);

  return <Screen><Header title="Devices" subtitle="Paired Windows computers" back right={<IconButton icon="plus" label="Pair a computer" onPress={() => router.push('/pair')} tone="primary" />} /><Surface style={styles.secureCard}><View style={[styles.secureIcon, { backgroundColor: colors.accent }]}><Feather name="shield" size={18} color={colors.primary} /></View><View style={{ flex: 1 }}><Text style={[styles.secureTitle, { color: colors.foreground }]}>Private by default</Text><Text style={[styles.secureBody, { color: colors.mutedForeground }]}>Pairing details are kept on this device. No agent connection is active yet.</Text></View></Surface><SectionTitle title={`${laptops.length} ${laptops.length === 1 ? 'computer' : 'computers'}`} />{laptops.length ? laptops.map((laptop) => <Surface key={laptop.id} style={[styles.deviceCard, selectedLaptopId === laptop.id && { borderColor: colors.primary }]}><Pressable testID={`select-${laptop.id}`} onPress={() => selectLaptop(laptop.id)} style={styles.deviceMain}><View style={[styles.deviceIcon, { backgroundColor: selectedLaptopId === laptop.id ? colors.accent : colors.surfaceRaised }]}><Feather name="monitor" size={20} color={selectedLaptopId === laptop.id ? colors.primary : colors.mutedForeground} /></View><View style={{ flex: 1 }}><Text style={[styles.deviceName, { color: colors.foreground }]}>{laptop.name}</Text><Text style={[styles.deviceHost, { color: colors.mutedForeground }]}>{laptop.host} · {laptop.os}</Text><View style={styles.deviceStatus}><StatusPill status={laptop.status} /><Text style={[styles.lastSeen, { color: colors.mutedForeground }]}>{laptop.lastSeen}</Text></View></View>{selectedLaptopId === laptop.id ? <Feather name="check" size={18} color={colors.primary} /> : null}</Pressable><View style={[styles.deviceActions, { borderTopColor: colors.border }]}><Pressable onPress={() => router.push({ pathname: '/pair', params: { editId: laptop.id } })} style={styles.action}><Feather name="edit-2" size={14} color={colors.primary} /><Text style={[styles.actionText, { color: colors.primary }]}>Edit details</Text></Pressable><Pressable onPress={() => confirmRemove(laptop.id, laptop.name)} style={styles.action}><Feather name="trash-2" size={14} color={colors.destructive} /><Text style={[styles.actionText, { color: colors.destructive }]}>Remove</Text></Pressable></View></Surface>) : <Surface style={styles.empty}><Feather name="monitor" size={24} color={colors.mutedForeground} /><Text style={[styles.emptyTitle, { color: colors.foreground }]}>No paired computers</Text><Text style={[styles.emptyBody, { color: colors.mutedForeground }]}>Pair a Windows agent to make this control room useful.</Text></Surface>}<Pressable testID="pair-computer" onPress={() => router.push('/pair')} style={({ pressed }) => [styles.pairButton, { backgroundColor: colors.primary, opacity: pressed ? 0.7 : 1 }]}><Feather name="link" size={17} color={colors.primaryForeground} /><Text style={[styles.pairButtonText, { color: colors.primaryForeground }]}>Pair another computer</Text></Pressable></Screen>;
}

const styles = StyleSheet.create({
  secureCard: { flexDirection: 'row', gap: 12, alignItems: 'center', padding: 14 },
  secureIcon: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  secureTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 13 },
  secureBody: { fontFamily: 'Inter_400Regular', fontSize: 11, lineHeight: 16, marginTop: 3 },
  deviceCard: { padding: 0, overflow: 'hidden', marginBottom: 10 },
  deviceMain: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 15 },
  deviceIcon: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  deviceName: { fontFamily: 'Inter_600SemiBold', fontSize: 15 },
  deviceHost: { fontFamily: 'Inter_400Regular', fontSize: 11, marginTop: 3 },
  deviceStatus: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 9 },
  lastSeen: { fontFamily: 'Inter_400Regular', fontSize: 10 },
  deviceActions: { borderTopWidth: 1, flexDirection: 'row', paddingVertical: 10, paddingHorizontal: 15, gap: 22 },
  action: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  actionText: { fontFamily: 'Inter_600SemiBold', fontSize: 11 },
  empty: { alignItems: 'center', paddingVertical: 30, gap: 8 },
  emptyTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 15 },
  emptyBody: { fontFamily: 'Inter_400Regular', fontSize: 12, textAlign: 'center', maxWidth: 250, lineHeight: 17 },
  pairButton: { height: 50, borderRadius: 15, flexDirection: 'row', gap: 9, justifyContent: 'center', alignItems: 'center', marginTop: 15 },
  pairButtonText: { fontFamily: 'Inter_600SemiBold', fontSize: 13 },
});