import { Feather } from '@expo/vector-icons';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';

export type ToastKind = 'success' | 'error' | 'info';

type ToastItem = {
  id: string;
  kind: ToastKind;
  title: string;
  message?: string;
};

type ToastContextValue = {
  show: (toast: { kind?: ToastKind; title: string; message?: string; durationMs?: number }) => void;
  dismiss: () => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

const ICONS: Record<ToastKind, keyof typeof Feather.glyphMap> = {
  success: 'check-circle',
  error: 'alert-circle',
  info: 'info',
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [toast, setToast] = useState<ToastItem | null>(null);
  const progress = useRef(new Animated.Value(0)).current;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const duration = useRef(4000);

  const clearTimer = useCallback(() => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  }, []);

  const hide = useCallback(() => {
    clearTimer();
    Animated.timing(progress, {
      toValue: 0,
      duration: 180,
      useNativeDriver: Platform.OS !== 'web',
    }).start(({ finished }) => {
      if (finished) setToast(null);
    });
  }, [clearTimer, progress]);

  const show = useCallback<ToastContextValue['show']>((next) => {
    clearTimer();
    duration.current = next.durationMs ?? (next.message ? 5200 : 3200);
    setToast({
      id: `${Date.now()}`,
      kind: next.kind ?? 'info',
      title: next.title,
      message: next.message,
    });
    progress.stopAnimation();
    progress.setValue(0);
    Animated.timing(progress, {
      toValue: 1,
      duration: 220,
      useNativeDriver: Platform.OS !== 'web',
    }).start();
  }, [clearTimer, progress]);

  useEffect(() => {
    if (!toast) return;
    clearTimer();
    timer.current = setTimeout(hide, duration.current);
    return clearTimer;
  }, [clearTimer, hide, toast]);

  useEffect(() => () => clearTimer(), [clearTimer]);

  const value = useMemo(() => ({ show, dismiss: hide }), [hide, show]);

  const tone = toast ? (toast.kind === 'success' ? colors.success : toast.kind === 'error' ? colors.destructive : colors.primary) : colors.primary;

  return (
    <ToastContext.Provider value={value}>
      {children}
      {toast ? (
        <Animated.View
          pointerEvents="box-none"
          style={[
            styles.wrap,
            { bottom: insets.bottom + (Platform.OS === 'web' ? 96 : 88) },
            {
              opacity: progress,
              transform: [{ translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [14, 0] }) }],
            },
          ]}
        >
          <Pressable
            accessibilityLiveRegion="polite"
            accessibilityRole="alert"
            testID="toast"
            onPress={hide}
            style={[styles.toast, { backgroundColor: colors.surfaceRaised, borderColor: `${tone}66` }]}
          >
            <View style={[styles.icon, { backgroundColor: `${tone}1F` }]}>
              <Feather name={ICONS[toast.kind]} size={16} color={tone} />
            </View>
            <View style={styles.copy}>
              <Text style={[styles.title, { color: colors.foreground }]}>{toast.title}</Text>
              {toast.message ? (
                <Text style={[styles.message, { color: colors.mutedForeground }]}>{toast.message}</Text>
              ) : null}
            </View>
            <Feather name="x" size={15} color={colors.mutedForeground} />
          </Pressable>
        </Animated.View>
      ) : null}
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used inside ToastProvider');
  return context;
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 14, right: 14, zIndex: 50 },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    borderWidth: 1,
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 13,
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  icon: { width: 32, height: 32, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  copy: { flex: 1 },
  title: { fontFamily: 'Inter_600SemiBold', fontSize: 13 },
  message: { fontFamily: 'Inter_400Regular', fontSize: 11, lineHeight: 16, marginTop: 2 },
});
