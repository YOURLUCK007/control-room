import { Feather } from '@expo/vector-icons';
import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Header, Screen, SectionTitle, Surface } from '@/components/RemoteUI';
import { useColors } from '@/hooks/useColors';
import { useRemote } from '@/context/RemoteContext';
import { sendAgentAction } from '@/lib/agentClient';
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

export default function FilesScreen() {
  const colors = useColors();
  const { selectedLaptop, settings } = useRemote();
  const [rootName, setRootName] = useState<FolderName>('Documents');
  const [rootPath, setRootPath] = useState('');
  const [currentPath, setCurrentPath] = useState('');
  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [editingPath, setEditingPath] = useState('');
  const [content, setContent] = useState('');
  const [loadedContent, setLoadedContent] = useState('');
  const [newFileName, setNewFileName] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  const listFolder = useCallback(async (path: string, selectedRoot = rootName) => {
    if (!selectedLaptop?.token) {
      setNotice('Pair the Windows agent first, then choose one of its folders.');
      return;
    }
    setBusy(true);
    setNotice('');
    try {
      const response = await sendAgentAction(selectedLaptop.host, selectedLaptop.port, selectedLaptop.token, 'LIST_FILES', { path }, false, settings.localOnly);
      if (!response.success) {
        setNotice(response.message);
        return;
      }
      const data = response.data ?? {};
      const resolvedPath = typeof data.path === 'string' ? data.path : path;
      setEntries(Array.isArray(data.entries) ? data.entries as FileEntry[] : []);
      setCurrentPath(resolvedPath);
      if (folders.includes(path as FolderName)) setRootPath(resolvedPath);
      setRootName(selectedRoot);
      setEditingPath('');
      setContent('');
      setLoadedContent('');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'The laptop could not be reached.');
    } finally {
      setBusy(false);
    }
  }, [rootName, selectedLaptop, settings.localOnly]);

  useEffect(() => {
    if (!rootPath) void listFolder(rootName, rootName);
  }, [listFolder, rootName, rootPath]);

  const openEntry = async (entry: FileEntry) => {
    if (entry.is_directory) {
      await listFolder(entry.path);
      return;
    }
    if (!selectedLaptop?.token) return;
    setBusy(true);
    setNotice('');
    try {
      const response = await sendAgentAction(selectedLaptop.host, selectedLaptop.port, selectedLaptop.token, 'READ_FILE', { path: entry.path }, false, settings.localOnly);
      const data = response.data ?? {};
      if (!response.success || typeof data.content !== 'string' || typeof data.path !== 'string') {
        setNotice(response.message || 'This file could not be opened as text.');
        return;
      }
      setEditingPath(data.path);
      setContent(data.content);
      setLoadedContent(data.content);
      setNotice(`Editing ${entry.name}. Saving replaces the file and keeps a backup beside it.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'The file could not be opened.');
    } finally {
      setBusy(false);
    }
  };

  const saveFile = (path: string, text: string, creating = false) => {
    if (!selectedLaptop?.token) {
      setNotice('Pair the Windows agent before saving files.');
      return;
    }
    confirmUserAction(
      creating ? 'Create this text file?' : 'Save changes to this file?',
      creating ? path : `${path}\n\nThe current file will be backed up beside it before saving.`,
      creating ? 'Create' : 'Save',
      async () => {
            setBusy(true);
            setNotice('');
            try {
              const response = await sendAgentAction(selectedLaptop.host, selectedLaptop.port, selectedLaptop.token!, 'WRITE_FILE', { path, content: text }, true, settings.localOnly);
              if (!response.success) {
                setNotice(response.message);
                return;
              }
              setEditingPath(path);
              setContent(text);
              setLoadedContent(text);
              setNewFileName('');
              setNotice(response.message + (response.data?.backup ? ` Backup: ${response.data.backup}` : ''));
              await listFolder(currentPath || rootName);
            } catch (error) {
              setNotice(error instanceof Error ? error.message : 'The file could not be saved.');
            } finally {
              setBusy(false);
            }
      },
    );
  };

  const createFile = () => {
    const name = newFileName.trim();
    if (!name || !/^[\w .()-]{1,100}$/.test(name) || name === '.' || name === '..') {
      setNotice('Use a simple file name without a path, such as meeting-notes.txt.');
      return;
    }
    const fileName = /\.[a-z0-9]{1,10}$/i.test(name) ? name : `${name}.txt`;
    const separator = currentPath.includes('\\') ? '\\' : '/';
    const path = `${currentPath.replace(/[\\/]+$/, '')}${separator}${fileName}`;
    saveFile(path, '', true);
  };

  const parentPath = currentPath.replace(/[\\/][^\\/]+[\\/]*$/, '');
  const canGoUp = Boolean(currentPath && rootPath && currentPath !== rootPath && parentPath);

  return (
    <Screen>
      <Header title="Laptop files" subtitle="Browse and edit text files on your Windows PC" back />
      <Surface style={styles.noticeCard}>
        <Feather name="shield" size={17} color={colors.primary} />
        <Text style={[styles.note, { color: colors.mutedForeground }]}>Access is limited to Desktop, Documents, and Downloads. Editing requires confirmation; overwritten files get a local backup.</Text>
      </Surface>

      <SectionTitle title="Choose a folder" />
      <View style={styles.folderRow}>
        {folders.map((folder) => (
          <Pressable key={folder} onPress={() => { if (rootName !== folder) { setRootName(folder); setRootPath(''); } }} style={[styles.folderChip, { backgroundColor: rootName === folder ? colors.accent : colors.card, borderColor: rootName === folder ? colors.primary : colors.border }]}>
            <Feather name={folder === 'Desktop' ? 'monitor' : 'folder'} size={14} color={colors.primary} />
            <Text style={[styles.folderText, { color: colors.foreground }]}>{folder}</Text>
          </Pressable>
        ))}
      </View>

      <SectionTitle title={currentPath ? currentPath.split(/[\\/]/).filter(Boolean).slice(-2).join(' / ') : 'Folder contents'} />
      <Surface style={styles.browserCard}>
        {canGoUp ? <Pressable disabled={busy} onPress={() => void listFolder(parentPath)} style={[styles.upButton, { borderBottomColor: colors.border }]}><Feather name="corner-left-up" size={15} color={colors.primary} /><Text style={[styles.upText, { color: colors.primary }]}>Up one folder</Text></Pressable> : null}
        {entries.length ? entries.map((entry) => (
          <Pressable key={entry.path} disabled={busy} onPress={() => void openEntry(entry)} style={({ pressed }) => [styles.fileRow, { borderBottomColor: colors.border, opacity: pressed || busy ? 0.65 : 1 }]}>
            <Feather name={entry.is_directory ? 'folder' : 'file-text'} size={17} color={entry.is_directory ? colors.primary : colors.mutedForeground} />
            <View style={{ flex: 1 }}>
              <Text numberOfLines={1} style={[styles.fileName, { color: colors.foreground }]}>{entry.name}</Text>
              <Text style={[styles.fileMeta, { color: colors.mutedForeground }]}>{entry.is_directory ? 'Folder' : `${Math.max(1, Math.ceil((entry.size ?? 0) / 1024))} KB · text files up to 128 KB`}</Text>
            </View>
            <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
          </Pressable>
        )) : <Text style={[styles.empty, { color: colors.mutedForeground }]}>{busy ? 'Connecting…' : 'This folder is empty, unavailable, or not paired.'}</Text>}
      </Surface>

      <SectionTitle title="Create a text file" />
      <View style={styles.newFileRow}>
        <TextInput value={newFileName} onChangeText={setNewFileName} placeholder="e.g. meeting-notes.txt" placeholderTextColor={colors.mutedForeground} style={[styles.nameInput, { color: colors.foreground, backgroundColor: colors.card, borderColor: colors.border }]} autoCapitalize="none" />
        <Pressable disabled={busy || !currentPath} onPress={createFile} style={[styles.createButton, { backgroundColor: colors.primary, opacity: busy || !currentPath ? 0.5 : 1 }]}><Text style={[styles.createText, { color: colors.primaryForeground }]}>Create</Text></Pressable>
      </View>

      {editingPath ? <>
        <SectionTitle title="Text editor" />
        <Text style={[styles.editPath, { color: colors.mutedForeground }]}>{editingPath}</Text>
        <TextInput multiline value={content} onChangeText={setContent} editable={!busy} textAlignVertical="top" style={[styles.editor, { color: colors.foreground, backgroundColor: colors.card, borderColor: colors.border }]} />
        <Pressable disabled={busy || content === loadedContent} onPress={() => saveFile(editingPath, content)} style={[styles.saveButton, { backgroundColor: content === loadedContent ? colors.muted : colors.primary, opacity: busy ? 0.55 : 1 }]}>
          <Feather name="save" size={16} color={colors.primaryForeground} />
          <Text style={[styles.createText, { color: colors.primaryForeground }]}>{busy ? 'Working…' : 'Review and save'}</Text>
        </Pressable>
      </> : null}

      {notice ? <Text selectable style={[styles.notice, { color: colors.mutedForeground }]}>{notice}</Text> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  noticeCard: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, padding: 13 },
  note: { flex: 1, fontSize: 11, lineHeight: 16, fontFamily: 'Inter_400Regular' },
  folderRow: { flexDirection: 'row', gap: 8 },
  folderChip: { flexDirection: 'row', alignItems: 'center', gap: 7, borderWidth: 1, borderRadius: 12, paddingHorizontal: 11, paddingVertical: 10 },
  folderText: { fontSize: 11, fontFamily: 'Inter_600SemiBold' },
  browserCard: { paddingVertical: 3, paddingHorizontal: 12 },
  upButton: { minHeight: 40, flexDirection: 'row', alignItems: 'center', gap: 8, borderBottomWidth: 1 },
  upText: { fontSize: 11, fontFamily: 'Inter_600SemiBold' },
  fileRow: { minHeight: 51, flexDirection: 'row', alignItems: 'center', gap: 10, borderBottomWidth: 1 },
  fileName: { fontSize: 12, fontFamily: 'Inter_600SemiBold' },
  fileMeta: { fontSize: 9, fontFamily: 'Inter_400Regular', marginTop: 3 },
  empty: { paddingVertical: 17, fontSize: 11, fontFamily: 'Inter_400Regular' },
  newFileRow: { flexDirection: 'row', gap: 8 },
  nameInput: { flex: 1, minHeight: 43, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, fontSize: 11, fontFamily: 'Inter_400Regular' },
  createButton: { minWidth: 72, alignItems: 'center', justifyContent: 'center', borderRadius: 12, paddingHorizontal: 12 },
  createText: { fontSize: 11, fontFamily: 'Inter_600SemiBold' },
  editPath: { fontSize: 10, fontFamily: 'Inter_400Regular', marginTop: -3, marginBottom: 8 },
  editor: { minHeight: 220, maxHeight: 420, borderWidth: 1, borderRadius: 15, padding: 13, fontSize: 12, lineHeight: 18, fontFamily: 'Inter_400Regular' },
  saveButton: { height: 46, borderRadius: 13, marginTop: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  notice: { fontSize: 10, lineHeight: 15, fontFamily: 'Inter_400Regular', marginTop: 12 },
});
