import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { FlatList, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { AppBar, Avatar, EmptyState, IconButton, PageTitle, Text } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import type { UserError } from '@/lib/errors';
import { useNavClearance } from '@/lib/layout';
import {
  addRecent,
  clearRecents,
  loadRecents,
  removeRecent,
  searchUsers,
  type SearchResult,
} from '@/lib/search';
import { fontFamilyFor, useTheme } from '@/lib/theme';

const DEBOUNCE_MS = 250;

/** Find people by name or username. Users only; no counts in results. */
export default function Search() {
  const { colors, radius, spacing, type } = useTheme();
  const { profile: mine, handleError } = useAuth();
  const router = useRouter();
  const navClearance = useNavClearance();
  const inputRef = useRef<TextInput>(null);

  const [text, setText] = useState('');
  const [results, setResults] = useState<SearchResult[] | null>(null);
  const [searched, setSearched] = useState('');
  const [failed, setError] = useState<{ q: string; err: UserError } | null>(null);
  const [recents, setRecents] = useState<string[]>(() => loadRecents());
  const [attempt, setAttempt] = useState(0);
  const seq = useRef(0);

  const q = text.trim();
  const error = failed && failed.q === q ? failed.err : null;
  const loading = q.length > 0 && searched !== q && !error;

  useEffect(() => {
    const id = ++seq.current;
    if (!q) return;
    const t = setTimeout(() => {
      searchUsers(q)
        .then((rows) => {
          if (id !== seq.current) return;
          setError(null);
          setResults(rows);
          setSearched(q);
        })
        .catch((e) => {
          if (id !== seq.current) return;
          setResults(null);
          setError({ q, err: handleError(e, 'search') });
        });
    }, DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [q, attempt, handleError]);

  const open = useCallback(
    (r: SearchResult) => {
      setRecents(addRecent(q));
      if (mine && r.username.toLowerCase() === mine.username.toLowerCase()) {
        router.navigate('/you');
      } else {
        router.push({ pathname: '/u/[username]', params: { username: r.username } });
      }
    },
    [q, mine, router],
  );

  const back = () => (router.canGoBack() ? router.back() : router.navigate('/'));

  const showResults = q.length > 0 && results !== null && !error;
  const current = showResults && searched === q;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <PageTitle title="Search" />
      <AppBar
        title="Search"
        left={<IconButton icon="chevron-back" label="Back" onPress={back} />}
      />
      <View style={{ padding: spacing.lg, paddingBottom: spacing.sm }}>
        <View
          style={[
            styles.box,
            {
              borderColor: colors.border,
              backgroundColor: colors.surface,
              borderRadius: radius.md,
              paddingHorizontal: spacing.md,
              gap: spacing.sm,
            },
          ]}
        >
          <Ionicons name="search-outline" size={20} color={colors.muted} />
          <TextInput
            ref={inputRef}
            autoFocus
            value={text}
            onChangeText={setText}
            placeholder="Search people"
            placeholderTextColor={colors.muted}
            accessibilityLabel="Search people"
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
            maxLength={60}
            onSubmitEditing={() => {
              if (current && results && results[0]) open(results[0]);
            }}
            onKeyPress={(e) => {
              if ((e.nativeEvent as { key?: string }).key === 'Escape') setText('');
            }}
            style={[
              styles.input,
              {
                color: colors.text,
                fontFamily: fontFamilyFor('400'),
                fontSize: type.body.fontSize,
              },
            ]}
          />
          {text ? (
            <IconButton
              icon="close-circle"
              label="Clear search"
              size={20}
              color={colors.muted}
              onPress={() => {
                setText('');
                inputRef.current?.focus();
              }}
            />
          ) : null}
        </View>
      </View>

      {error && q ? (
        <EmptyState
          compact
          illustration={null}
          title={error.title}
          message={error.message}
          actionLabel={error.retryable ? 'Try again' : undefined}
          onAction={error.retryable ? () => setAttempt((n) => n + 1) : undefined}
        />
      ) : !q ? (
        recents.length > 0 ? (
          <FlatList
            data={recents}
            keyExtractor={(r) => r}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ paddingBottom: navClearance }}
            ListHeaderComponent={
              <View style={[styles.recentHead, { paddingHorizontal: spacing.lg }]}>
                <Text variant="callout" tone="muted">
                  Recent
                </Text>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => setRecents(clearRecents())}
                  hitSlop={8}
                >
                  <Text variant="callout" tone="secondary">
                    Clear all
                  </Text>
                </Pressable>
              </View>
            }
            renderItem={({ item }) => (
              <View style={[styles.recent, { paddingHorizontal: spacing.lg }]}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Search ${item}`}
                  onPress={() => setText(item)}
                  style={[styles.recentMain, { gap: spacing.md }]}
                >
                  <Ionicons name="time-outline" size={20} color={colors.muted} />
                  <Text numberOfLines={1} style={styles.flex}>
                    {item}
                  </Text>
                </Pressable>
                <IconButton
                  icon="close"
                  label={`Remove ${item}`}
                  size={18}
                  color={colors.muted}
                  onPress={() => setRecents(removeRecent(item))}
                />
              </View>
            )}
          />
        ) : (
          <EmptyState
            compact
            illustration={null}
            title="Find people by name or username"
            message="Start typing to look someone up."
          />
        )
      ) : showResults && results!.length === 0 && current ? (
        <EmptyState
          compact
          illustration={null}
          title="No one found"
          message={`Nothing matched "${searched}". Check the spelling or try a username.`}
        />
      ) : showResults ? (
        <FlatList
          data={results}
          keyExtractor={(r) => r.user_id}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingBottom: navClearance }}
          style={{ opacity: current && !loading ? 1 : 0.6 }}
          renderItem={({ item }) => (
            <Pressable
              accessibilityRole="link"
              accessibilityLabel={`${item.display_name || item.username}, @${item.username}`}
              onPress={() => open(item)}
              style={(s) => [
                styles.row,
                {
                  paddingHorizontal: spacing.lg,
                  gap: spacing.md,
                  backgroundColor:
                    s.pressed || (s as { hovered?: boolean }).hovered
                      ? colors.surface
                      : 'transparent',
                },
              ]}
            >
              <Avatar username={item.username} displayName={item.display_name} size="md" />
              <View style={styles.flex}>
                <Text weight="600" numberOfLines={1}>
                  {item.display_name || item.username}
                </Text>
                <Text variant="callout" tone="muted" numberOfLines={1}>
                  @{item.username}
                </Text>
                {item.bio_snippet ? (
                  <Text variant="callout" tone="secondary" numberOfLines={1}>
                    {item.bio_snippet}
                  </Text>
                ) : null}
              </View>
            </Pressable>
          )}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  box: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, minHeight: 48 },
  input: { flex: 1, paddingVertical: 12, outlineWidth: 0 },
  row: { flexDirection: 'row', alignItems: 'center', minHeight: 64, paddingVertical: 8 },
  recentHead: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8 },
  recent: { flexDirection: 'row', alignItems: 'center', minHeight: 48 },
  recentMain: { flex: 1, flexDirection: 'row', alignItems: 'center', minHeight: 44 },
});
