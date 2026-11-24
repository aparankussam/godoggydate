// mobile/components/CityFeed.tsx
// The city feed: Pack Days, structured board posts and lost-dog alerts for the
// member's city, newest first. Posts use fixed templates (no open forum) and
// expire on their own. Report / block on someone else's post; claim or delete
// your own. Logic lives in shared/cityFeed.ts and lib/cityFeed.ts.

import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, TextInput, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { colors, fonts } from '../constants/theme';
import { Heading, Paper, PaperButton, PinkButton, Slip, Tag, type } from './pack/kit';
import PackDayCard from './PackDayCard';
import { createCityPost, loadCityFeed, updateCityPost } from '../lib/cityFeed';
import { openReportSheet } from '../lib/reports';
import { CITY_FEED_LIMITS, POST_TEMPLATES, POST_TEMPLATE_KEYS } from '../../shared/cityFeed';
import type { FeedItem, PostTemplate } from '../../shared/cityFeed';
import type { PackDay } from '../../shared/packDay';

interface Props {
  uid: string;
  city: string | undefined;
  canPost: boolean;
  blocked: ReadonlySet<string>;
  reloadToken: number;
}

function ago(ms: number): string {
  const mins = Math.max(1, Math.round((Date.now() - ms) / 60000));
  if (mins < 60) return `${mins}m ago`;
  return mins < 1440 ? `${Math.round(mins / 60)}h ago` : `${Math.round(mins / 1440)}d ago`;
}

export default function CityFeed({ uid, city, canPost, blocked, reloadToken }: Props) {
  const [items, setItems] = useState<FeedItem[] | null>(null);
  const [days, setDays] = useState<Map<string, PackDay>>(new Map());
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const [template, setTemplate] = useState<PostTemplate | null>(null);
  const [text, setText] = useState('');
  const [place, setPlace] = useState('');
  const [posting, setPosting] = useState(false);
  const [postError, setPostError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (!city) return undefined;
      let active = true;
      setError(null);
      loadCityFeed(city, blocked)
        .then((r) => { if (active) { setItems(r.items); setDays(r.days); } })
        .catch((e) => { console.warn('Failed to load city feed:', e); if (active) setError('We couldn’t load the feed. Pull to refresh.'); });
      return () => { active = false; };
    }, [city, blocked, reloadToken, version]),
  );

  async function submit() {
    if (!template) return;
    setPosting(true);
    setPostError(null);
    const err = await createCityPost({ template, text, place });
    setPosting(false);
    if (err) { setPostError(err); return; }
    setTemplate(null); setText(''); setPlace('');
    setVersion((v) => v + 1);
  }

  async function close(postId: string, action: 'claim' | 'delete') {
    try { await updateCityPost(postId, action); setVersion((v) => v + 1); }
    catch { Alert.alert('That didn’t go through', 'Please try again.'); }
  }

  if (!city) {
    return <Slip tone="info"><Text style={type.body}>Add your city to your dog’s profile to see what’s happening nearby.</Text></Slip>;
  }

  return (
    <View>
      {template ? (
        <Paper style={styles.composer}>
          <Heading size={20}>{POST_TEMPLATES[template].emoji} {POST_TEMPLATES[template].label}</Heading>
          <Text style={type.soft}>{POST_TEMPLATES[template].prompt}</Text>
          <TextInput
            style={[styles.input, styles.multiline]} value={text} onChangeText={setText} multiline
            maxLength={CITY_FEED_LIMITS.maxTextLength} placeholder="Keep it short and friendly"
            accessibilityLabel="Post text"
          />
          <TextInput
            style={styles.input} value={place} onChangeText={setPlace} maxLength={CITY_FEED_LIMITS.maxPlaceLength}
            placeholder={POST_TEMPLATES[template].placeRequired ? 'Where? (required)' : 'Where? (optional)'}
            accessibilityLabel="Place"
          />
          {postError && <Slip tone="error"><Text style={type.body}>{postError}</Text></Slip>}
          <PinkButton label="Post" onPress={submit} busy={posting} disabled={!text.trim()} />
          <PaperButton small label="Cancel" onPress={() => { setTemplate(null); setPostError(null); }} />
        </Paper>
      ) : canPost ? (
        <View style={styles.chips}>
          {POST_TEMPLATE_KEYS.map((k) => (
            <PaperButton key={k} small label={`${POST_TEMPLATES[k].emoji} ${POST_TEMPLATES[k].label}`} onPress={() => setTemplate(k)} />
          ))}
        </View>
      ) : (
        <Text style={[type.soft, styles.gate]}>Finish your dog’s profile to post to your neighbors.</Text>
      )}

      {error && <Slip tone="error"><Text style={type.body}>{error}</Text></Slip>}
      {!items && !error && <ActivityIndicator color={colors.ink} style={styles.loading} />}
      {items?.length === 0 && (
        <Paper><Text style={type.soft}>Nothing here yet. Be the first to post, or host a Pack Day.</Text></Paper>
      )}

      {items?.map((item) => {
        if (item.kind === 'packday') {
          const e = days.get(item.id);
          return e ? <PackDayCard key={`d${item.id}`} event={e} badge={e.hostUid === uid ? 'hosting' : e.attendeeUids.includes(uid) ? 'going' : undefined} /> : null;
        }
        if (item.kind === 'lost') {
          const d = item.data;
          return (
            <Paper key={`l${item.id}`} style={styles.card}>
              <Tag label="Lost dog" icon="alert" dark />
              <Text style={type.strong}>{String(d.dogName ?? d.title ?? 'A dog is missing nearby')}</Text>
              {!!(d.lastSeen ?? d.lastSeenPlace) && <Text style={type.soft}>Last seen: {String(d.lastSeen ?? d.lastSeenPlace)}</Text>}
            </Paper>
          );
        }
        const mine = item.authorUid === uid;
        const t = POST_TEMPLATES[item.template];
        if (!t) return null;
        return (
          <Paper key={`p${item.id}`} style={styles.card}>
            <View style={styles.row}>
              <Tag label={`${t.emoji} ${t.label}`} />
              <Text style={type.small}>{ago(item.sortMs)}</Text>
            </View>
            <Text style={type.body}>{item.text}</Text>
            {!!item.place && <Text style={type.soft}>📍 {item.place}</Text>}
            <View style={styles.row}>
              {mine ? (
                <>
                  {item.template === 'free_lend' && <PaperButton small label="Mark claimed" onPress={() => void close(item.id, 'claim')} />}
                  <PaperButton small label="Delete" onPress={() => void close(item.id, 'delete')} />
                </>
              ) : (
                <PaperButton
                  small label="Report or block" icon="flag"
                  onPress={() => openReportSheet(
                    { reporterId: uid, targetUserId: item.authorUid, source: 'cityfeed', postId: item.id },
                    { onBlocked: () => setVersion((v) => v + 1) },
                  )}
                />
              )}
            </View>
          </Paper>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  composer: { gap: 10, marginBottom: 18 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 18 },
  gate: { marginBottom: 18 },
  input: {
    borderWidth: 2, borderColor: colors.ink, borderRadius: 12, backgroundColor: colors.cream,
    paddingHorizontal: 12, paddingVertical: 10, fontFamily: fonts.bold, fontSize: 15, color: colors.ink,
  },
  multiline: { minHeight: 80, textAlignVertical: 'top' },
  loading: { paddingVertical: 40 },
  card: { marginBottom: 14, gap: 8 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' },
});
