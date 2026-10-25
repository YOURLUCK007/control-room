import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  AgentCommandResult,
  AgentScheme,
  AgentTarget,
  agentErrorMessage,
  checkAgent,
  pairWithAgent,
  sendAgentAction,
  sendNaturalLanguageCommand,
} from '@/lib/agentClient';

export type ConnectionState = 'offline' | 'online' | 'connecting';

export type Laptop = {
  id: string;
  name: string;
  host: string;
  port: number;
  token?: string;
  scheme?: AgentScheme;
  lastSeen: string;
  status: ConnectionState;
  os: string;
};

export type DeviceStatus = {
  state: ConnectionState;
  checkedAt?: string;
  latencyMs?: number;
  message?: string;
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
  localOnly: boolean;
};

type RemoteState = {
  laptops: Laptop[];
  selectedLaptopId: string | null;
  commands: CommandRecord[];
  settings: Settings;
  statuses: Record<string, DeviceStatus>;
};

type RemoteContextValue = RemoteState & {
  hydrated: boolean;
  selectedLaptop: Laptop | null;
  selectedStatus: DeviceStatus;
  selectedTarget: AgentTarget | null;
  addLaptop: (laptop: Omit<Laptop, 'id' | 'lastSeen' | 'status'>) => Promise<void>;
  pairLaptop: (details: { name: string; host: string; port: number; code: string; os: string }) => Promise<string | null>;
  updateLaptop: (id: string, patch: Partial<Pick<Laptop, 'name' | 'host' | 'os'>>) => Promise<void>;
  removeLaptop: (id: string) => Promise<void>;
  selectLaptop: (id: string) => Promise<void>;
  queueCommand: (text: string, confirm?: boolean) => Promise<CommandSubmission>;
  runAction: (action: Parameters<typeof sendAgentAction>[1], parameters?: Record<string, unknown>, confirm?: boolean) => Promise<AgentCommandResult>;
  checkConnection: (id: string) => Promise<DeviceStatus>;
  checkAllConnections: () => Promise<void>;
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
    localOnly: true,
  },
  statuses: {},
};

const offlineStatus: DeviceStatus = { state: 'offline' };

const RemoteContext = createContext<RemoteContextValue | null>(null);

function makeId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/** Builds a protocol-aware target for the LAN client. */
export function agentTargetFor(laptop: Laptop, localOnly: boolean): AgentTarget {
  return {
    host: laptop.host,
    port: laptop.port,
    scheme: laptop.scheme,
    token: laptop.token,
    localOnly,
  };
}

export function RemoteProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<RemoteState>(initialState);
  const [hydrated, setHydrated] = useState(false);
  const stateRef = useRef(state);
  stateRef.current = state;
  const checkedOnLaunch = useRef(false);

  useEffect(() => {
    let active = true;
    AsyncStorage.getItem(STORAGE_KEY)
      .then((saved) => {
        if (!saved || !active) return;
        try {
          const parsed = JSON.parse(saved) as Partial<RemoteState> & { settings?: Partial<Settings> };
          const laptops = (parsed.laptops ?? initialState.laptops)
            .filter((laptop) => !(laptop.id === 'luna-office' && !laptop.token))
            .map((laptop) => ({ ...laptop, port: laptop.port ?? 8765 }));
          const commands = (parsed.commands ?? initialState.commands)
            .filter((item) => item.id !== 'welcome');
          const selectedLaptopId = laptops.some((laptop) => laptop.id === parsed.selectedLaptopId)
            ? parsed.selectedLaptopId ?? null
            : laptops[0]?.id ?? null;
          const statuses: Record<string, DeviceStatus> = {};
          for (const laptop of laptops) statuses[laptop.id] = { state: 'offline' };
          setState({
            ...initialState,
            ...parsed,
            laptops,
            commands,
            selectedLaptopId,
            // Older builds stored a biometric flag that was never wired to UI.
            settings: {
              confirmCommands: parsed.settings?.confirmCommands ?? initialState.settings.confirmCommands,
              localOnly: parsed.settings?.localOnly ?? initialState.settings.localOnly,
            },
            statuses,
          });
        } catch {
          setState(initialState);
        }
      })
      .finally(() => {
        if (active) setHydrated(true);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (hydrated) void AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [hydrated, state]);

  const selectedLaptop = state.laptops.find((item) => item.id === state.selectedLaptopId) ?? null;
  const selectedStatus = selectedLaptop ? state.statuses[selectedLaptop.id] ?? offlineStatus : offlineStatus;
  const selectedTarget = selectedLaptop ? agentTargetFor(selectedLaptop, state.settings.localOnly) : null;

  const setStatus = useCallback((id: string, patch: Partial<DeviceStatus>) => {
    setState((prev) => {
      const current = prev.statuses[id] ?? offlineStatus;
      const next: DeviceStatus = { ...current, ...patch };
      const laptops = next.state === 'online' || patch.checkedAt
        ? prev.laptops.map((laptop) => (laptop.id === id
          ? {
            ...laptop,
            status: next.state,
            lastSeen: next.state === 'online' ? next.checkedAt ?? laptop.lastSeen : laptop.lastSeen,
          }
          : laptop))
        : prev.laptops;
      return { ...prev, statuses: { ...prev.statuses, [id]: next }, laptops };
    });
  }, []);

  const checkConnection = useCallback(async (id: string): Promise<DeviceStatus> => {
    const laptop = stateRef.current.laptops.find((item) => item.id === id);
    if (!laptop) return offlineStatus;
    if (!laptop.token) {
      const status: DeviceStatus = {
        state: 'offline',
        checkedAt: new Date().toISOString(),
        message: 'Pairing token missing. Pair this computer again.',
      };
      setStatus(id, status);
      return status;
    }
    setStatus(id, { state: 'connecting', message: undefined });
    try {
      const health = await checkAgent(agentTargetFor(laptop, stateRef.current.settings.localOnly));
      const status: DeviceStatus = {
        state: 'online',
        checkedAt: new Date().toISOString(),
        latencyMs: health.latencyMs,
        message: `${health.agent ?? 'Laptop Remote agent'} · protocol ${health.protocol ?? '1'}`,
      };
      setStatus(id, status);
      if (health.scheme && health.scheme !== laptop.scheme) {
        setState((prev) => ({
          ...prev,
          laptops: prev.laptops.map((item) => (item.id === id ? { ...item, scheme: health.scheme } : item)),
        }));
      }
      return status;
    } catch (error) {
      const status: DeviceStatus = {
        state: 'offline',
        checkedAt: new Date().toISOString(),
        message: agentErrorMessage(error),
      };
      setStatus(id, status);
      return status;
    }
  }, [setStatus]);

  const checkAllConnections = useCallback(async () => {
    const laptops = stateRef.current.laptops;
    await Promise.all(laptops.map((laptop) => checkConnection(laptop.id)));
  }, [checkConnection]);

  useEffect(() => {
    if (!hydrated || checkedOnLaunch.current) return;
    checkedOnLaunch.current = true;
    void checkAllConnections();
  }, [checkAllConnections, hydrated]);

  const addLaptop = useCallback(async (details: Omit<Laptop, 'id' | 'lastSeen' | 'status'>) => {
    const laptop: Laptop = { ...details, id: makeId(), lastSeen: 'Not connected yet', status: 'offline' };
    setState((prev) => ({
      ...prev,
      laptops: [...prev.laptops, laptop],
      selectedLaptopId: laptop.id,
      statuses: { ...prev.statuses, [laptop.id]: { state: 'offline' } },
    }));
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }, []);

  const pairLaptop = useCallback(async (details: { name: string; host: string; port: number; code: string; os: string }) => {
    const baseTarget: AgentTarget = {
      host: details.host.trim(),
      port: details.port,
      localOnly: stateRef.current.settings.localOnly,
    };
    try {
      // Probe first so the encrypted endpoint is used when the agent has TLS.
      const health = await checkAgent(baseTarget);
      const result = await pairWithAgent({ ...baseTarget, scheme: health.scheme }, details.code);
      if (!result.success || !result.access_token) return result.message ?? 'The agent rejected this pairing code.';
      const laptop: Laptop = {
        id: result.computer?.id ?? makeId(),
        name: details.name.trim() || result.computer?.name || 'Windows computer',
        host: details.host.trim(),
        port: details.port,
        token: result.access_token,
        scheme: result.scheme ?? health.scheme,
        lastSeen: new Date().toISOString(),
        status: 'online',
        os: details.os.trim() || result.computer?.os || 'Windows',
      };
      setState((prev) => ({
        ...prev,
        laptops: [...prev.laptops.filter((item) => item.id !== laptop.id), laptop],
        selectedLaptopId: laptop.id,
        statuses: {
          ...prev.statuses,
          [laptop.id]: {
            state: 'online',
            checkedAt: new Date().toISOString(),
            latencyMs: health.latencyMs,
            message: `${health.agent ?? 'Laptop Remote agent'} · protocol ${health.protocol ?? '1'}`,
          },
        },
      }));
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      return null;
    } catch (error) {
      return agentErrorMessage(error);
    }
  }, []);

  const updateLaptop = useCallback(async (id: string, patch: Partial<Pick<Laptop, 'name' | 'host' | 'os'>>) => {
    setState((prev) => ({
      ...prev,
      laptops: prev.laptops.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    }));
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }, []);

  const removeLaptop = useCallback(async (id: string) => {
    setState((prev) => {
      const laptops = prev.laptops.filter((item) => item.id !== id);
      const statuses = { ...prev.statuses };
      delete statuses[id];
      return {
        ...prev,
        laptops,
        statuses,
        selectedLaptopId: prev.selectedLaptopId === id ? laptops[0]?.id ?? null : prev.selectedLaptopId,
      };
    });
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, []);

  const selectLaptop = useCallback(async (id: string) => {
    setState((prev) => ({ ...prev, selectedLaptopId: id }));
    await Haptics.selectionAsync();
  }, []);

  const runAction = useCallback(async (
    action: Parameters<typeof sendAgentAction>[1],
    parameters: Record<string, unknown> = {},
    confirm = false,
  ): Promise<AgentCommandResult> => {
    const laptop = stateRef.current.laptops.find((item) => item.id === stateRef.current.selectedLaptopId);
    if (!laptop?.token) {
      return { success: false, message: 'Pair a Windows computer first. Nothing was sent.' };
    }
    const startedAt = Date.now();
    try {
      const response = await sendAgentAction(
        agentTargetFor(laptop, stateRef.current.settings.localOnly),
        action,
        parameters,
        confirm,
      );
      setStatus(laptop.id, {
        state: 'online',
        checkedAt: new Date().toISOString(),
        latencyMs: Date.now() - startedAt,
        message: undefined,
      });
      return response;
    } catch (error) {
      const message = agentErrorMessage(error);
      setStatus(laptop.id, { state: 'offline', checkedAt: new Date().toISOString(), message });
      return { success: false, message };
    }
  }, [setStatus]);

  const queueCommand = useCallback(async (text: string, confirm = false): Promise<CommandSubmission> => {
    const trimmed = text.trim();
    if (!trimmed) return { result: 'failed', message: 'Enter a command first.' };
    const snapshot = stateRef.current;
    const laptop = snapshot.laptops.find((item) => item.id === snapshot.selectedLaptopId);
    let result: CommandRecord['result'] = 'offline';
    let message = 'No Windows agent is paired with this phone yet.';
    let response: AgentCommandResult | undefined;

    if (laptop?.token) {
      const startedAt = Date.now();
      try {
        response = await sendNaturalLanguageCommand(
          agentTargetFor(laptop, snapshot.settings.localOnly),
          trimmed,
          confirm,
        );
        result = response.success ? 'sent' : response.requires_confirmation ? 'confirmation' : 'failed';
        message = response.message;
        setStatus(laptop.id, {
          state: 'online',
          checkedAt: new Date().toISOString(),
          latencyMs: Date.now() - startedAt,
          message: undefined,
        });
      } catch (error) {
        result = 'offline';
        message = agentErrorMessage(error);
        setStatus(laptop.id, { state: 'offline', checkedAt: new Date().toISOString(), message });
      }
    }

    const record: CommandRecord = { id: makeId(), text: trimmed, createdAt: new Date().toISOString(), result };
    setState((prev) => ({ ...prev, commands: [record, ...prev.commands].slice(0, 50) }));
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    return { result, message, requires_confirmation: response?.requires_confirmation, data: response?.data };
  }, [setStatus]);

  const clearHistory = useCallback(async () => {
    setState((prev) => ({ ...prev, commands: [] }));
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }, []);

  const updateSettings = useCallback(async (patch: Partial<Settings>) => {
    setState((prev) => ({ ...prev, settings: { ...prev.settings, ...patch } }));
    await Haptics.selectionAsync();
  }, []);

  const value = useMemo<RemoteContextValue>(() => ({
    ...state,
    hydrated,
    selectedLaptop,
    selectedStatus,
    selectedTarget,
    addLaptop,
    pairLaptop,
    updateLaptop,
    removeLaptop,
    selectLaptop,
    queueCommand,
    runAction,
    checkConnection,
    checkAllConnections,
    clearHistory,
    updateSettings,
  }), [
    addLaptop,
    checkAllConnections,
    checkConnection,
    clearHistory,
    hydrated,
    pairLaptop,
    queueCommand,
    removeLaptop,
    runAction,
    selectLaptop,
    selectedLaptop,
    selectedStatus,
    selectedTarget,
    state,
    updateSettings,
    updateLaptop,
  ]);

  return <RemoteContext.Provider value={value}>{children}</RemoteContext.Provider>;
}

export function useRemote() {
  const context = useContext(RemoteContext);
  if (!context) throw new Error('useRemote must be used inside RemoteProvider');
  return context;
}
