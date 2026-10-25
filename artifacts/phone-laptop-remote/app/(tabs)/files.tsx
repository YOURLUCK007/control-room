import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { Platform, Pressable, RefreshControl, StyleSheet, Text, TextInput, View } from 'react-native';
import { Button, EmptyState, Header, Screen, SectionTitle, Surface } from '@/components/RemoteUI';
import { useToast } from '@/components/Toast';
import { useColors } from '@/hooks/useColors';
import { useRemote } from '@/context/RemoteContext';
import { confirmUserAction } from '@/lib/userPrompt';

type FileEntry = {
  name: string;
  path: string;
  is_directory: boolean;
  size: number | null;
  modified: number;
};

type FolderName = 'Documents' | 'Downloads' | 'Desktop';

const folders: FolderName[] = ['Documents', 'Downloads', 'Desktop'];

const MAX_OPEN_BYTES = 128 * 1024;

function formatSize(bytes: number | null) {
  if (bytes === null || typeof bytes !== 'number') return 'Folder';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fileIcon(name: string, isDirectory: boolean): keyof typeof Feather.glyphMap {
  if (isDirectory) return 'folder';
  const extension = name.split('.').pop()?.toLowerCase();
  if (extension && ['json', 'js', 'ts', 'tsx', 'jsx'].includes(extension)) return 'code';
  if (extension && ['md', 'txt', 'log', 'csv'].includes(extension)) return 'file-text';
  return 'file';
}

export default function FilesScreen() {
  const colors = useColors();
  const router = useRouter();
  const toast = useToast();
  const { selectedLaptop, runAction } = useRemote();
  const [rootName, setRootName] = useState<FolderName>('Documents');
  const [rootPath, setRootPath] = useState('');
  const [currentPath, setCurrentPath] = useState('');
  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [editingPath, setEditingPath] = useState('');
  const [content, setContent] = useState('');
  const [loadedContent, setLoadedContent] = useState('');
  const [newFileName, setNewFileName] = useState('');
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const dirty = Boolean(editingPath) && content !== loadedContent;

  const listFolder = useCallback(async (path: string, options: { silent?: boolean } = {}) => {
    if (!selectedLaptop?.token) {
      toast.show({ kind: 'info', title: 'No laptop paired', message: 'Pair the Windows agent to browse its folders.' });
      return;
    }
    if (!options.silent) setBusy(true);
    const response = await runAction('LIST_FILES', { path });
    if (!options.silent) setBusy(false);
    if (!response.success) {
      toast.show({ kind: 'error', title: 'Could not open that folder', message: response.message });
      return;
    }
    const data = response.data ?? {};
    const resolvedPath = typeof data.path === 'string' ? data.path : path;
    setEntries(Array.isArray(data.entries) ? (data.entries as FileEntry[]) : []);
    setCurrentPath(resolvedPath);
    if (folders.includes(path as FolderName)) setRootPath(resolvedPath);
    setEditingPath('');
    setContent('');
    setLoadedContent('');
  }, [runAction, selectedLaptop?.token, toast]);

  useEffect(() => {
    if (loaded) return;
    setLoaded(true);
    void listFolder('Documents');
  }, [listFolder, loaded]);

  const withDirtyGuard = (action: () => void) => {
    if (!dirty) {
      action();
      return;
    }
    confirmUserAction(
      'Discard unsaved changes?',
      `${editingPath.split(/[\\/]/).pop() ?? 'This file'} has edits that are not saved on your laptop yet.`,
      'Discard and continue',
      action,
    );
  };

  const openEntry = async (entry: FileEntry) => {
    if (entry.is_directory) {
      withDirtyGuard(() => { void listFolder(entry.path); });
      return;
    }
    if (!selectedLaptop?.token) return;
    if (entry.size !== null && entry.size > MAX_OPEN_BYTES) {
      toast.show({ kind: 'error', title: 'File is too large', message: `The phone editor opens text files up to ${MAX_OPEN_BYTES / 1024} KB.` });
      return;
    }
    withDirtyGuard(() => { void (async () => {
      setBusy(true);
      const response = await runAction('READ_FILE', { path: entry.path });
      setBusy(false);
      const data = response.data ?? {};
      if (!response.success || typeof data.content !== 'string' || typeof data.path !== 'string') {
        toast.show({ kind: 'error', title: 'Could not open that file', message: response.message || 'It may not be UTF-8 text.' });
        return;
      }
      setEditingPath(data.path);
      setContent(data.content);
      setLoadedContent(data.content);
      toast.show({ kind: 'info', title: `Editing ${entry.name}`, message: 'Saving keeps a timestamped backup beside the original.' });
    })(); });
  };

  const saveFile = (path: string, text: string, creating = false) => {
    if (!selectedLaptop?.token) {
      toast.show({ kind: 'info', title: 'No laptop paired', message: 'Pair the Windows agent before saving files.' });
      return;
    }
    confirmUserAction(
      creating ? 'Create this text file?' : 'Save changes to this file?',
      creating ? path : `${path}\n\nThe current file is copied to a timestamped backup first.`,
      creating ? 'Create' : 'Save',
      async () => {
        setBusy(true);
        const response = await runAction('WRITE_FILE', { path, content: text }, true);
        setBusy(false);
        if (!response.success) {
          toast.show({ kind: 'error', title: 'File not saved', message: response.message });
          return;
        }
        setEditingPath(path);
        setContent(text);
        setLoadedContent(text);
        setNewFileName('');
        const backup = response.data?.backup;
        toast.show({
          kind: 'success',
          title: creating ? 'File created' : 'Changes saved',
          message: typeof backup === 'string' ? `Backup kept at ${backup.split(/[\\/]/).pop()}` : response.message,
        });
        await listFolder(currentPath || rootName, { silent: true });
      },
    );
  };

  const createFile = () => {
    const name = newFileName.trim();
    if (!name || !/^[\w .()-]{1,100}$/.test(name) || name === '.' || name === '..') {
      toast.show({ kind: 'error', title: 'Check the file name', message: 'Use a simple name such as meeting-notes.txt.' });
      return;
    }
    const fileName = /\.[a-z0-9]{1,10}$/i.test(name) ? name : `${name}.txt`;
    const separator = currentPath.includes('\\') ? '\\' : '/';
    saveFile(`${currentPath.replace(/[\\/]+$/, '')}${separator}${fileName}`, '', true);
  };

  const parentPath = currentPath.replace(/[\\/][^\\/]+[\\/]*$/, '');
  const canGoUp = Boolean(currentPath && rootPath && currentPath !== rootPath && parentPath);
  const crumb = currentPath ? currentPath.split(/[\\/]/).filter(Boolean).slice(-2).join(' / ') : 'Folder contents';

  const refresh = async () => {
    if (!selectedLaptop?.token) return;
    setRefreshing(true);
    await listFolder(currentPath || rootName, { silent: true });
    setRefreshing(false);
  };

  if (!selectedLaptop) {
    return (
      <Screen bottomPadding={96}>
        <Header title="Files" subtitle="Browse your Windows folders" />
        <EmptyState
          icon="folder"
          title="Pair a computer first"
          body="The file browser reads and writes text files in Desktop, Documents, and Downloads on your paired laptop."
          action={{ label: 'Pair a computer', onPress: () => router.push('/pair') }}
        />
      </Screen>
    );
  }

  return (
    <Screen
      bottomPadding={96}
      refreshControl={Platform.OS === 'web' ? undefined : (
        <RefreshControl refreshing={refreshing} onRefresh={() => { void refresh(); }} tintColor={colors.primary} colors={[colors.primary]} />
      )}
    >
      <Header title="Files" subtitle={selectedLaptop.name} />

      <Surface style={styles.noticeCard}>
        <Feather name="shield" size={16} color={colors.primary} />
        <Text style={[styles.note, { color: colors.mutedForeground }]}>
          Limited to Desktop, Documents, and Downloads. Saving asks first and keeps a backup.
        </Text>
      </Surface>

      <SectionTitle title="Folders" />
      <View style={styles.folderRow}>
        {folders.map((folder) => {
          const active = rootName === folder;
          return (
            <Pressable
              key={folder}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              onPress={() => {
                if (active) return;
                withDirtyGuard(() => {
                  setRootName(folder);
                  setRootPath('');
                  void listFolder(folder);
                });
              }}
              style={[styles.folderChip, { backgroundColor: active ? colors.accent : colors.card, borderColor: active ? colors.primary : colors.border }]}
            >
              <Feather name={folder === 'Desktop' ? 'monitor' : 'folder'} size={13} color={active ? colors.primary : colors.mutedForeground} />
              <Text style={[styles.folderText, { color: active ? colors.foreground : colors.mutedForeground }]}>{folder}</Text>
            </Pressable>
          );
        })}
      </View>

      <SectionTitle title={crumb} caption={`${entries.length} ${entries.length === 1 ? 'item' : 'items'}`} />
      <Surface style={styles.browserCard}>
        {canGoUp ? (
          <Pressable
            accessibilityRole="button"
            disabled={busy}
            onPress={() => withDirtyGuard(() => { void listFolder(parentPath); })}
            style={[styles.upButton, { borderBottomColor: colors.border }]}
          >
            <Feather name="corner-left-up" size={14} color={colors.primary} />
            <Text style={[styles.upText, { color: colors.primary }]}>Up one folder</Text>
          </Pressable>
        ) : null}
        {busy ? (
          <View style={styles.loadingRow}>
            <Feather name="loader" size={15} color={colors.mutedForeground} />
            <Text style={[styles.empty, { color: colors.mutedForeground }]}>Reading folder…</Text>
          </View>
        ) : entries.length ? entries.map((entry) => (
          <Pressable
            key={entry.path}
            accessibilityRole="button"
            disabled={busy}
            onPress={() => { void openEntry(entry); }}
            style={({ pressed }) => [styles.fileRow, { borderBottomColor: colors.border, opacity: pressed ? 0.6 : 1 }]}
          >
            <Feather name={fileIcon(entry.name, entry.is_directory)} size={16} color={entry.is_directory ? colors.primary : colors.mutedForeground} />
            <View style={{ flex: 1 }}>
              <Text numberOfLines={1} style={[styles.fileName, { color: colors.foreground }]}>{entry.name}</Text>
              <Text style={[styles.fileMeta, { color: colors.mutedForeground }]}>
                {entry.is_directory ? 'Folder' : `${formatSize(entry.size)} · tap to edit`}
              </Text>
            </View>
            <Feather name="chevron-right" size={15} color={colors.mutedForeground} />
          </Pressable>
        )) : (
          <Text style={[styles.empty, { color: colors.mutedForeground }]}>
            {`Nothing in ${rootName}. Pull down to refresh.`}
          </Text>
        )}
      </Surface>

      <SectionTitle title="Create a text file" caption={currentPath ? 'In this folder' : 'Open a folder first'} />
      <View style={styles.newFileRow}>
        <TextInput
          value={newFileName}
          onChangeText={setNewFileName}
          placeholder="meeting-notes.txt"
          placeholderTextColor={colors.mutedForeground}
          style={[styles.nameInput, { color: colors.foreground, backgroundColor: colors.card, borderColor: colors.border }]}
          autoCapitalize="none"
          autoCorrect={false}
          onSubmitEditing={createFile}
          returnKeyType="done"
        />
        <Button
          label="Create"
          variant="secondary"
          disabled={busy || !currentPath}
          onPress={createFile}
          style={styles.createButton}
        />
      </View>

      {editingPath ? (
        <>
          <SectionTitle
            title="Text editor"
            caption={dirty ? 'Unsaved changes' : 'Saved on your laptop'}
            action={dirty ? 'Revert' : undefined}
            onAction={dirty ? () => setContent(loadedContent) : undefined}
          />
          <View style={styles.editMeta}>
            <Feather name="file-text" size={12} color={colors.mutedForeground} />
            <Text style={[styles.editPath, { color: colors.mutedForeground }]} numberOfLines={1}>{editingPath}</Text>
            <View style={[styles.dirtyDot, { backgroundColor: dirty ? colors.warning : colors.success }]} />
          </View>
          <TextInput
            multiline
            value={content}
            onChangeText={setContent}
            editable={!busy}
            textAlignVertical="top"
            style={[styles.editor, { color: colors.foreground, backgroundColor: colors.card, borderColor: dirty ? `${colors.warning}88` : colors.border }]}
          />
          <View style={styles.editorFooter}>
            <Text style={[styles.editorCount, { color: colors.mutedForeground }]}>
              {content.length.toLocaleString()} characters · limit {MAX_OPEN_BYTES / 1024} KB
            </Text>
          </View>
          <Button
            label={dirty ? 'Review and save' : 'No changes to save'}
            icon={dirty ? 'save' : 'check'}
            loading={busy}
            disabled={!dirty || content.length > MAX_OPEN_BYTES}
            onPress={() => saveFile(editingPath, content)}
          />
          <Button
            label="Close editor"
            variant="secondary"
            onPress={() => withDirtyGuard(() => { setEditingPath(''); setContent(''); setLoadedContent(''); })}
            style={{ marginTop: 9 }}
          />
        </>
      ) : null}
      <View style={{ height: 8 }} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  noticeCard: { flexDirection: 'row', alignItems: 'flex-start', gap: 9, padding: 12 },
  note: { flex: 1, fontSize: 10.5, lineHeight: 15, fontFamily: 'Inter_400Regular' },
  folderRow: { flexDirection: 'row', gap: 8 },
  folderChip: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderWidth: 1, borderRadius: 12, paddingVertical: 10 },
  folderText: { fontSize: 10.5, fontFamily: 'Inter_600SemiBold' },
  browserCard: { paddingVertical: 2, paddingHorizontal: 13 },
  upButton: { minHeight: 40, flexDirection: 'row', alignItems: 'center', gap: 7, borderBottomWidth: 1 },
  upText: { fontSize: 11, fontFamily: 'Inter_600SemiBold' },
  fileRow: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 10, borderBottomWidth: 1 },
  fileName: { fontSize: 12.5, fontFamily: 'Inter_600SemiBold' },
  fileMeta: { fontSize: 9.5, fontFamily: 'Inter_400Regular', marginTop: 3 },
  loadingRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 18 },
  empty: { paddingVertical: 18, fontSize: 11, fontFamily: 'Inter_400Regular' },
  newFileRow: { flexDirection: 'row', gap: 8 },
  nameInput: { flex: 1, minHeight: 48, borderWidth: 1, borderRadius: 14, paddingHorizontal: 12, fontSize: 12, fontFamily: 'Inter_400Regular' },
  createButton: { minWidth: 92 },
  editMeta: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8, marginTop: -2 },
  editPath: { fontSize: 10, fontFamily: 'Inter_400Regular', flex: 1 },
  dirtyDot: { width: 6, height: 6, borderRadius: 99 },
  editor: { minHeight: 240, maxHeight: 440, borderWidth: 1, borderRadius: 15, padding: 13, fontSize: 12.5, lineHeight: 19, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
  editorFooter: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 7, marginBottom: 10 },
  editorCount: { fontSize: 9.5, fontFamily: 'Inter_400Regular' },
});
