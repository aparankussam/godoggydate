// mobile/components/playroom/BarkRecorder.tsx
// A bottom sheet on Snoot Boop: record up to 3 seconds of your own dog barking,
// listen back, and keep it. Once kept, every boop plays it (lib/myBark.ts).

import { useEffect, useRef, useState } from 'react';
import { Alert, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import {
  RecordingPresets,
  createAudioPlayer,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
  type AudioPlayer,
} from 'expo-audio';
import { colors, fonts } from '../../constants/theme';
import { Heading, InkLink, PaperButton, PinkButton } from '../pack/kit';
import { deleteMyBark, saveMyBark } from '../../lib/myBark';
import { trackEvent } from '../../lib/analytics';

const MAX_SECONDS = 3;
// Back to Snoot Boop's own session: respects the silent switch, mixes with music.
const PLAY_MODE = { allowsRecording: false, playsInSilentMode: true, interruptionMode: 'mixWithOthers' } as const;

interface Props {
  visible: boolean;
  uid: string;
  dogName: string;
  hasBark: boolean;
  onClose: () => void;
  onChange: (uri: string | null) => void;
}

export default function BarkRecorder({ visible, uid, dogName, hasBark, onClose, onChange }: Props) {
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const rec = useAudioRecorderState(recorder, 100);
  const [draft, setDraft] = useState<string | null>(null);
  const preview = useRef<AudioPlayer | null>(null);
  const stopTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const dropPreview = () => {
    try { preview.current?.remove(); } catch { /* already gone */ }
    preview.current = null;
  };

  useEffect(() => () => {
    if (stopTimer.current) clearTimeout(stopTimer.current);
    dropPreview();
  }, []);

  async function start() {
    const perm = await requestRecordingPermissionsAsync().catch(() => null);
    if (!perm?.granted) {
      Alert.alert('Microphone is off', `Turn on the microphone for GoDoggyDate in Settings to record ${dogName}'s bark.`);
      return;
    }
    dropPreview();
    setDraft(null);
    try {
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      trackEvent('bark_record_start');
      stopTimer.current = setTimeout(() => { void stop(); }, MAX_SECONDS * 1000);
    } catch {
      Alert.alert('Could not record', 'Something on this phone is using the microphone. Try again in a moment.');
      setAudioModeAsync(PLAY_MODE).catch(() => {});
    }
  }

  async function stop() {
    if (stopTimer.current) { clearTimeout(stopTimer.current); stopTimer.current = null; }
    try {
      await recorder.stop();
      setDraft(recorder.uri);
    } catch {
      /* nothing was recording */
    }
    setAudioModeAsync(PLAY_MODE).catch(() => {});
  }

  function listen() {
    if (!draft) return;
    try {
      if (!preview.current) preview.current = createAudioPlayer(draft);
      preview.current.seekTo(0).catch(() => {});
      preview.current.play();
    } catch {
      /* preview is optional */
    }
  }

  function keep() {
    if (!draft) return;
    try {
      const uri = saveMyBark(uid, draft);
      trackEvent('bark_saved');
      dropPreview();
      setDraft(null);
      onChange(uri);
      onClose();
    } catch {
      Alert.alert('Could not save', 'Try recording again.');
    }
  }

  function remove() {
    deleteMyBark(uid);
    trackEvent('bark_removed');
    onChange(null);
    onClose();
  }

  const seconds = Math.min(MAX_SECONDS, rec.durationMillis / 1000);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.scrim} onPress={rec.isRecording ? undefined : onClose} accessibilityLabel="Close" />
      <View style={styles.sheet}>
        <Heading size={22}>{dogName}&apos;s real bark</Heading>
        <Text style={styles.body}>
          Get {dogName} to bark, then tap record. You get {MAX_SECONDS} seconds. Every boop will play it, and it gets higher the faster you boop.
        </Text>

        {rec.isRecording ? (
          <>
            <View style={styles.meter}>
              <View style={[styles.meterFill, { width: `${(seconds / MAX_SECONDS) * 100}%` }]} />
            </View>
            <PinkButton label="Stop" icon="stop" onPress={() => { void stop(); }} />
          </>
        ) : draft ? (
          <View style={styles.row}>
            <PaperButton label="Listen" icon="play" onPress={listen} style={styles.grow} />
            <PaperButton label="Again" icon="refresh" onPress={() => { void start(); }} style={styles.grow} />
            <PinkButton label="Keep it" icon="check" onPress={keep} style={styles.grow} />
          </View>
        ) : (
          <PinkButton label={hasBark ? 'Record a new bark' : 'Record'} icon="microphone" onPress={() => { void start(); }} />
        )}

        {hasBark && !rec.isRecording && !draft && (
          <InkLink label="Go back to the boop sound" onPress={remove} center />
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: { flex: 1, backgroundColor: 'rgba(42,31,74,0.35)' },
  sheet: {
    backgroundColor: colors.cream,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 2,
    borderColor: colors.ink,
    padding: 20,
    paddingBottom: 36,
    gap: 14,
  },
  body: { fontFamily: fonts.bold, fontSize: 15, lineHeight: 21, color: colors.ink },
  meter: { height: 14, borderRadius: 999, borderWidth: 2, borderColor: colors.ink, backgroundColor: colors.cream, overflow: 'hidden' },
  meterFill: { height: '100%', backgroundColor: colors.primary },
  row: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  grow: { flexGrow: 1 },
});
