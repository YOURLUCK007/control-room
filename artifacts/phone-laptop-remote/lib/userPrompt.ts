import { Alert, Platform } from 'react-native';

export function confirmUserAction(title: string, message: string, confirmLabel: string, onConfirm: () => void | Promise<void>) {
  if (Platform.OS === 'web') {
    const browser = globalThis as typeof globalThis & { confirm?: (message: string) => boolean };
    if (browser.confirm?.(`${title}\n\n${message}`)) void onConfirm();
    return;
  }
  Alert.alert(title, message, [
    { text: 'Cancel', style: 'cancel' },
    { text: confirmLabel, style: 'destructive', onPress: () => { void onConfirm(); } },
  ]);
}

export function showUserMessage(title: string, message: string) {
  if (Platform.OS === 'web') {
    const browser = globalThis as typeof globalThis & { alert?: (message: string) => void };
    browser.alert?.(`${title}\n\n${message}`);
    return;
  }
  Alert.alert(title, message);
}
