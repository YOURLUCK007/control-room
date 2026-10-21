import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { AgentCommandResult, pairWithAgent, sendNaturalLanguageCommand } from '@/lib/agentClient';

export type Laptop = {
  id: string;
  name: string;
  host: string;
  port: number;
  token?: string;
  lastSeen: string;
  status: 'offline' | 'online' | 'connecting';
  os: string;
};

export type CommandRecord = {
  id: string;
  text: string;
  createdAt: string;
  result: 'queued' | 'offline' | 'sent' | 'failed' | 'confirmation';
};

export type CommandSubmission = {
  result: CommandRecord['result'];
  message: string;
  requires_confirmation?: boolean;
  data?: Record<string, unknown>;
};

export type Settings = {
  confirmCommands: boolean;
  biometricLock: boolean;
  localOnly: boolean;
};

type RemoteState = {
  laptops: Laptop[];
  selectedLaptopId: string | null;
  commands: CommandRecord[];
  settings: Settings;
};

type RemoteContextValue = RemoteState & {
  hydrated: boolean;
  selectedLaptop: Laptop | null;
  addLaptop: (laptop: Omit<Laptop, 'id' | 'lastSeen' | 'status'>) => Promise<void>;
  pairLaptop: (details: { name: string; host: string; port: number; code: string; os: string }) => Promise<string | null>;
  updateLaptop: (id: string, patch: Partial<Pick<Laptop, 'name' | 'host' | 'os'>>) => Promise<void>;
  removeLaptop: (id: string) => Promise<void>;
  selectLaptop: (id: string) => Promise<void>;
  queueCommand: (text: string, confirm?: boolean) => Promise<CommandSubmission>;
  clearHistory: () => Promise<void>;
  updateSettings: (patch: Partial<Settings>) => Promise<void>;
};

const STORAGE_KEY = 'laptop-remote.local.v1';
const initialState: RemoteState = {
  laptops: [],
  selectedLaptopId: null,
  commands: [],
  settings: {
    confirmCommands: true,
    biometricLock: false,
    localOnly: true,
  },
};

const RemoteContext = createContext<RemoteContextValue | null>(null);

function makeId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function RemoteProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<RemoteState>(initialState);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    let active = true;
    AsyncStorage.getItem(STORAGE_KEY)
      .then((saved) => {
        if (saved && active) {
          try {
            const parsed = JSON.parse(saved) as Partial<RemoteState>;
            const laptops = (parsed.laptops ?? initialState.laptops)
              .filter((laptop) => !(laptop.id === 'luna-office' && !laptop.token))
              .map((laptop) => ({ ...laptop, port: laptop.port ?? 8765 }));
            const commands = (parsed.commands ?? initialState.commands)
              .filter((item) => item.id !== 'welcome');
            const selectedLaptopId = laptops.some((laptop) => laptop.id === parsed.selectedLaptopId)
              ? parsed.selectedLaptopId ?? null
              : laptops[0]?.id ?? null;
            setState({
              ...initialState,
              ...parsed,
              laptops,
              commands,
              selectedLaptopId,
            });
          } catch {
            setState(initialState);
          }
        }
      })
      .finally(() => active && setHydrated(true));
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (hydrated) AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [hydrated, state]);

  const persist = useCallback(async (next: RemoteState) => {
    setState(next);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }, []);

  const addLaptop = useCallback(async (details: Omit<Laptop, 'id' | 'lastSeen' | 'status'>) => {
    const laptop: Laptop = { ...details, id: makeId(), lastSeen: 'Not connected yet', status: 'offline' };
    await persist({ ...state, laptops: [...state.laptops, laptop], selectedLaptopId: laptop.id });
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }, [persist, state]);

  const pairLaptop = useCallback(async (details: { name: string; host: string; port: number; code: string; os: string }) => {
    try {
      const result = await pairWithAgent(details.host, details.port, details.code, state.settings.localOnly);
      if (!result.success || !result.access_token) return result.message ?? 'The agent rejected this pairing code.';
      const laptop: Laptop = {
        id: result.computer?.id ?? makeId(),
        name: details.name.trim() || result.computer?.name || 'Windows computer',
        host: details.host.trim(),
        port: details.port,
        token: result.access_token,
        lastSeen: new Date().toISOString(),
        status: 'online',
        os: details.os.trim() || result.computer?.os || 'Windows',
      };
      await persist({
        ...state,
        laptops: [...state.laptops.filter((item) => item.id !== laptop.id), laptop],
        selectedLaptopId: laptop.id,
      });
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      return null;
    } catch (error) {
      return error instanceof Error ? error.message : 'The laptop could not be reached.';
    }
  }, [persist, state]);

  const updateLaptop = useCallback(async (id: string, patch: Partial<Pick<Laptop, 'name' | 'host' | 'os'>>) => {
    await persist({ ...state, laptops: state.laptops.map((item) => item.id === id ? { ...item, ...patch } : item) });
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }, [persist, state]);

  const removeLaptop = useCallback(async (id: string) => {
    const laptops = state.laptops.filter((item) => item.id !== id);
    await persist({ ...state, laptops, selectedLaptopId: state.selectedLaptopId === id ? laptops[0]?.id ?? null : state.selectedLaptopId });
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, [persist, state]);

  const selectLaptop = useCallback(async (id: string) => {
    await persist({ ...state, selectedLaptopId: id });
    await Haptics.selectionAsync();
  }, [persist, state]);

  const selectedLaptop = state.laptops.find((item) => item.id === state.selectedLaptopId) ?? null;

  const queueCommand = useCallback(async (text: string, confirm = false): Promise<CommandSubmission> => {
    const trimmed = text.trim();
    if (!trimmed) return { result: 'failed', message: 'Enter a command first.' };
    let result: CommandRecord['result'] = 'offline';
    let response: AgentCommandResult | undefined;
    let message = 'Laptop agent is offline. This command was saved only in local history.';
    if (selectedLaptop?.token) {
      try {
        response = await sendNaturalLanguageCommand(selectedLaptop.host, selectedLaptop.port, selectedLaptop.token, trimmed, confirm, state.settings.localOnly);
        result = response.success ? 'sent' : response.requires_confirmation ? 'confirmation' : 'failed';
        message = response.message;
      } catch (error) {
        result = 'offline';
        message = error instanceof Error ? error.message : 'The laptop could not be reached. Nothing was run.';
      }
    }
    const record: CommandRecord = { id: makeId(), text: trimmed, createdAt: new Date().toISOString(), result };
    await persist({ ...state, commands: [record, ...state.commands].slice(0, 50) });
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    return { result, message, requires_confirmation: response?.requires_confirmation, data: response?.data };
  }, [persist, selectedLaptop, state]);

  const clearHistory = useCallback(async () => {
    await persist({ ...state, commands: [] });
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }, [persist, state]);

  const updateSettings = useCallback(async (patch: Partial<Settings>) => {
    await persist({ ...state, settings: { ...state.settings, ...patch } });
    await Haptics.selectionAsync();
  }, [persist, state]);

  const value = useMemo<RemoteContextValue>(() => ({
    ...state,
    hydrated,
    selectedLaptop: state.laptops.find((item) => item.id === state.selectedLaptopId) ?? null,
    addLaptop,
    pairLaptop,
    updateLaptop,
    removeLaptop,
    selectLaptop,
    queueCommand,
    clearHistory,
    updateSettings,
  }), [addLaptop, clearHistory, hydrated, pairLaptop, queueCommand, removeLaptop, selectLaptop, state, updateSettings]);

  return <RemoteContext.Provider value={value}>{children}</RemoteContext.Provider>;
}

export function useRemote() {
  const context = useContext(RemoteContext);
  if (!context) throw new Error('useRemote must be used inside RemoteProvider');
  return context;
}