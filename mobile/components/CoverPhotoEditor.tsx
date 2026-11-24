// mobile/components/CoverPhotoEditor.tsx
// Lets the owner choose which photo is their "cover" (the hero shown on cards)
// and drag a focal point so the crop keeps the subject in frame. Mirrors
// web/components/CoverPhotoEditor.tsx: the same coverFocusX / coverFocusY
// fields on the same 0–100 scale, and picking another photo starts it centred.
//
// Also home to CoverImage, which draws a photo cropped around that focal point.
// React Native's <Image> has no object-position, so CoverImage measures its box
// and the photo, then places a cover-sized image inside a clipped view with
// coverCropLayout() (lib/coverPhoto.ts) — the same arithmetic as the CSS web
// uses, so a photo crops to the same spot on both.

import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { colors, fonts } from '../constants/theme';
import {
  clampCoverFocus,
  coverCropLayout,
  DEFAULT_COVER_FOCUS,
  heroAspect,
  type CoverFocus,
} from '../lib/coverPhoto';

// ── CoverImage ───────────────────────────────────────────────────────────────

// Natural sizes, so a photo that's already been drawn once lands in the right
// spot on its next mount instead of starting centred and then moving.
const naturalSizes = new Map<string, { width: number; height: number }>();

interface CoverImageProps {
  uri: string;
  /** Where to crop around. Undefined, or the centre, is a plain centre crop. */
  focus?: CoverFocus | null;
  /** The box the photo fills. It's clipped to these bounds. */
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}

/** A photo that fills its box like `object-fit: cover`, cropped around `focus`. */
export function CoverImage({ uri, focus, style, accessibilityLabel }: CoverImageProps) {
  const [box, setBox] = useState<{ width: number; height: number } | null>(null);
  const [natural, setNatural] = useState(() => naturalSizes.get(uri) ?? null);
  // Whether this photo has finished loading (or failed to). A photo isn't on
  // screen before that anyway, so holding it back until it can be placed
  // costs nothing and saves a visible jump from the centre to the focus.
  const [settled, setSettled] = useState(() => naturalSizes.has(uri));

  useEffect(() => {
    setNatural(naturalSizes.get(uri) ?? null);
    setSettled(naturalSizes.has(uri));
  }, [uri]);

  const fx = clampCoverFocus(focus?.x);
  const fy = clampCoverFocus(focus?.y);
  const centred = fx === DEFAULT_COVER_FOCUS && fy === DEFAULT_COVER_FOCUS;
  // Until both sizes are known the photo is centre-cropped, which is also
  // exactly right for a centred focus. The box is measured either way: a
  // focus dragged off the centre later needs the size already in hand, and
  // onLayout only fires on a layout change.
  const layout = !centred && box && natural
    ? coverCropLayout(box.width, box.height, natural.width, natural.height, fx, fy)
    : null;
  // If the load event never reports a size, fall back to a centre crop rather
  // than hiding the photo.
  const hidden = !centred && !layout && !settled;

  function handleLayout(event: LayoutChangeEvent) {
    const { width, height } = event.nativeEvent.layout;
    setBox((prev) => (prev && prev.width === width && prev.height === height ? prev : { width, height }));
  }

  return (
    <View
      style={[styles.clip, style]}
      onLayout={handleLayout}
      accessible={Boolean(accessibilityLabel)}
      accessibilityRole={accessibilityLabel ? 'image' : undefined}
      accessibilityLabel={accessibilityLabel}
      pointerEvents="none"
    >
      <Image
        source={{ uri }}
        style={[layout ?? StyleSheet.absoluteFill, hidden && styles.hidden]}
        resizeMode="cover"
        onLoad={(event) => {
          const source = event.nativeEvent?.source;
          if (source && source.width > 0 && source.height > 0) {
            const size = { width: source.width, height: source.height };
            naturalSizes.set(uri, size);
            setNatural((prev) => (prev && prev.width === size.width && prev.height === size.height ? prev : size));
          }
          setSettled(true);
        }}
        onError={() => setSettled(true)}
      />
    </View>
  );
}

// ── CoverPhotoEditor ─────────────────────────────────────────────────────────

export interface CoverChange {
  coverIndex: number;
  focusX: number;
  focusY: number;
}

interface EditorProps {
  /** Display URIs in the same order as the saved photos array. */
  photos: string[];
  coverIndex: number;
  focusX: number;
  focusY: number;
  onChange: (value: CoverChange) => void;
  /**
   * True while a finger is dragging the focal point, false when it lifts. A
   * parent ScrollView should stop scrolling meanwhile, or a vertical drag
   * moves the page as well as the point.
   */
  onDragStateChange?: (dragging: boolean) => void;
  /** Shown over the photo, like the swipe card does. */
  dogName?: string;
  caption?: string;
}

const A11Y_STEP = 10;

/** A photo's pixel size, from the cache CoverImage fills or Image.getSize. */
export function useNaturalSize(uri: string | undefined): { width: number; height: number } | null {
  const [size, setSize] = useState(() => (uri ? naturalSizes.get(uri) ?? null : null));
  useEffect(() => {
    if (!uri) return undefined;
    const known = naturalSizes.get(uri);
    if (known) { setSize(known); return undefined; }
    let alive = true;
    Image.getSize(uri, (width, height) => {
      naturalSizes.set(uri, { width, height });
      if (alive) setSize({ width, height });
    }, () => {});
    return () => { alive = false; };
  }, [uri]);
  return size;
}

/** The Pupfile hero: the photo at its own shape (see heroAspect), cropped
 *  around the focus only when it's very tall or very wide. */
export function HeroPhoto({ uri, focus, style }: { uri: string; focus?: CoverFocus; style?: StyleProp<ViewStyle> }) {
  const natural = useNaturalSize(uri);
  return <CoverImage uri={uri} focus={focus} style={[style, { aspectRatio: heroAspect(natural) }]} />;
}

type Frame = 'card' | 'pupfile';
const CARD_ASPECT = 3 / 4;

export default function CoverPhotoEditor({
  photos,
  coverIndex,
  focusX,
  focusY,
  onChange,
  onDragStateChange,
  dogName,
  caption,
}: EditorProps) {
  const [frame, setFrame] = useState<Frame>('card');
  const [box, setBox] = useState({ width: 0, height: 0 });
  // Where the drag started: the finger and the focus at that moment.
  const start = useRef({ pageX: 0, pageY: 0, x: 50, y: 50 });

  const idx = Math.min(Math.max(0, coverIndex), Math.max(0, photos.length - 1));
  const cover = photos[idx];
  const natural = useNaturalSize(cover);
  if (!cover) return null;

  const x = clampCoverFocus(focusX);
  const y = clampCoverFocus(focusY);
  const aspect = frame === 'card' ? CARD_ASPECT : heroAspect(natural);
  const crop = natural ? coverCropLayout(box.width, box.height, natural.width, natural.height, x, y) : null;
  // How far the photo overhangs the frame: the room there is to drag it.
  const spareX = crop ? crop.width - box.width : 0;
  const spareY = crop ? crop.height - box.height : 0;
  const movable = spareX > 1 || spareY > 1;

  function dragTo(pageX: number, pageY: number) {
    // Dragging the photo right shows more of its left side: the focus moves left.
    const nextX = spareX > 1 ? Math.round(clampCoverFocus(start.current.x - ((pageX - start.current.pageX) / spareX) * 100)) : x;
    const nextY = spareY > 1 ? Math.round(clampCoverFocus(start.current.y - ((pageY - start.current.pageY) / spareY) * 100)) : y;
    if (nextX !== x || nextY !== y) onChange({ coverIndex: idx, focusX: nextX, focusY: nextY });
  }

  function nudge(dx: number, dy: number) {
    onChange({
      coverIndex: idx,
      focusX: Math.max(0, Math.min(100, x + dx)),
      focusY: Math.max(0, Math.min(100, y + dy)),
    });
  }

  return (
    <View>
      <View style={styles.frameSwitch}>
        {(['card', 'pupfile'] as const).map((f) => (
          <Pressable
            key={f}
            onPress={() => setFrame(f)}
            accessibilityRole="tab"
            accessibilityState={{ selected: frame === f }}
            style={[styles.frameChip, frame === f && styles.frameChipOn]}
          >
            <Text style={[styles.frameChipText, frame === f && styles.frameChipTextOn]}>
              {f === 'card' ? 'Swipe card' : 'Pupfile'}
            </Text>
          </Pressable>
        ))}
      </View>
      <View
        style={[styles.frameBox, { aspectRatio: aspect }]}
        onLayout={(event) => {
          const { width, height } = event.nativeEvent.layout;
          setBox((prev) => (prev.width === width && prev.height === height ? prev : { width, height }));
        }}
        onStartShouldSetResponder={() => movable}
        onMoveShouldSetResponder={() => movable}
        // Keep the drag once it's started, rather than handing it to the ScrollView.
        onResponderTerminationRequest={() => false}
        onResponderGrant={(event) => {
          start.current = { pageX: event.nativeEvent.pageX, pageY: event.nativeEvent.pageY, x, y };
          onDragStateChange?.(true);
        }}
        onResponderMove={(event) => dragTo(event.nativeEvent.pageX, event.nativeEvent.pageY)}
        onResponderRelease={() => onDragStateChange?.(false)}
        onResponderTerminate={() => onDragStateChange?.(false)}
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel={frame === 'card' ? 'Photo position on the swipe card' : 'Photo position on Pupfile'}
        accessibilityHint="Swipe up or down to move it. More actions move it left or right."
        accessibilityValue={{ text: `${x}% across, ${y}% down` }}
        accessibilityActions={[
          { name: 'increment', label: 'Move down' },
          { name: 'decrement', label: 'Move up' },
          { name: 'moveLeft', label: 'Move left' },
          { name: 'moveRight', label: 'Move right' },
        ]}
        onAccessibilityAction={(event) => {
          switch (event.nativeEvent.actionName) {
            case 'increment': nudge(0, A11Y_STEP); break;
            case 'decrement': nudge(0, -A11Y_STEP); break;
            case 'moveLeft': nudge(-A11Y_STEP, 0); break;
            case 'moveRight': nudge(A11Y_STEP, 0); break;
          }
        }}
      >
        <CoverImage uri={cover} focus={{ x, y }} style={StyleSheet.absoluteFill} />
        {frame === 'card' && dogName ? (
          <View pointerEvents="none" style={styles.cardCaption}>
            <Text style={styles.cardName} numberOfLines={1}>{dogName}</Text>
            {caption ? <Text style={styles.cardMeta} numberOfLines={1}>{caption}</Text> : null}
          </View>
        ) : null}
      </View>
      <Text style={styles.hint}>
        {movable ? 'Drag the photo to move it.' : 'The whole photo fits here, so there is nothing to move.'}
        {photos.length > 1 ? ' Or pick another photo below.' : ''}
      </Text>

      {photos.length > 1 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.thumbRow}
          keyboardShouldPersistTaps="handled"
        >
          {photos.map((url, i) => (
            <Pressable
              key={`${url}-${i}`}
              onPress={() => onChange({ coverIndex: i, focusX: DEFAULT_COVER_FOCUS, focusY: DEFAULT_COVER_FOCUS })}
              accessibilityRole="button"
              accessibilityLabel={`Use photo ${i + 1} as cover`}
              accessibilityState={{ selected: i === idx }}
              style={[styles.thumb, i === idx && styles.thumbActive]}
            >
              <Image source={{ uri: url }} style={styles.thumbImage} />
            </Pressable>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

// ── CoverPhotoSheet ──────────────────────────────────────────────────────────

interface SheetProps {
  visible: boolean;
  photos: string[];
  /** The cover the sheet opens on. */
  coverIndex: number;
  focus: CoverFocus;
  dogName: string;
  saving: boolean;
  /** The line under the name, as on the swipe card. */
  caption?: string;
  onCancel: () => void;
  onSave: (value: CoverChange) => void;
}

/**
 * The profile view's way in: a sheet holding the editor with Save and Cancel,
 * so the owner can re-crop (or swap) the cover without opening the whole
 * profile form. A sheet rather than an inline editor so the drag never fights
 * the profile's own scrolling.
 */
export function CoverPhotoSheet({ visible, photos, coverIndex, focus, dogName, caption, saving, onCancel, onSave }: SheetProps) {
  const [draft, setDraft] = useState<CoverChange>({ coverIndex, focusX: focus.x, focusY: focus.y });

  // Start from what's saved each time the sheet opens.
  useEffect(() => {
    if (visible) setDraft({ coverIndex, focusX: focus.x, focusY: focus.y });
  }, [visible, coverIndex, focus.x, focus.y]);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onCancel}
    >
      <SafeAreaView style={styles.sheet}>
        <View style={styles.sheetHeader}>
          <Pressable onPress={onCancel} hitSlop={10} accessibilityRole="button" disabled={saving}>
            <Text style={styles.sheetCancel}>Cancel</Text>
          </Pressable>
          <Text style={styles.sheetTitle}>Adjust card photo</Text>
          <Pressable
            onPress={() => onSave(draft)}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Save cover photo"
            disabled={saving}
          >
            {saving ? <ActivityIndicator color={colors.primary} /> : <Text style={styles.sheetSave}>Save</Text>}
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={styles.sheetBody}>
          <Text style={styles.sheetIntro}>
            This is how {dogName} shows up to other dogs. We already centred it on {dogName}; move it if you like.
          </Text>
          <CoverPhotoEditor
            photos={photos}
            coverIndex={draft.coverIndex}
            focusX={draft.focusX}
            focusY={draft.focusY}
            onChange={setDraft}
            dogName={dogName}
            caption={caption}
          />
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  clip: { overflow: 'hidden' },
  hidden: { opacity: 0 },
  frameBox: {
    width: '100%',
    borderRadius: 24,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: colors.ink,
    backgroundColor: colors.creamDark,
  },
  frameSwitch: { flexDirection: 'row', justifyContent: 'center', gap: 8, marginBottom: 12 },
  frameChip: { minHeight: 36, paddingHorizontal: 14, borderRadius: 18, borderWidth: 2, borderColor: colors.ink, backgroundColor: colors.cream, justifyContent: 'center' },
  frameChipOn: { backgroundColor: colors.ink },
  frameChipText: { fontFamily: fonts.black, fontSize: 13, color: colors.ink },
  frameChipTextOn: { color: colors.cream },
  cardCaption: { position: 'absolute', left: 0, right: 0, bottom: 0, padding: 14, backgroundColor: 'rgba(42,31,74,0.55)' },
  cardName: { fontFamily: fonts.display, fontSize: 26, color: colors.cream },
  cardMeta: { fontFamily: fonts.bold, fontSize: 13, color: colors.cream },
  hint: {
    marginTop: 8,
    textAlign: 'center',
    fontFamily: fonts.bold,
    fontSize: 12,
    color: colors.brownMid,
  },
  thumbRow: {
    gap: 8,
    paddingTop: 12,
    paddingBottom: 2,
    paddingHorizontal: 2,
    flexGrow: 1,
    justifyContent: 'center',
  },
  thumb: {
    width: 64,
    height: 64,
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: colors.ink,
    backgroundColor: colors.creamDark,
    opacity: 0.85,
  },
  thumbActive: { borderColor: colors.ink, opacity: 1 },
  thumbImage: { width: '100%', height: '100%' },
  sheet: { flex: 1, backgroundColor: colors.cream },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.creamDark,
  },
  sheetTitle: { fontFamily: fonts.display, fontSize: 20, color: colors.brown },
  sheetCancel: { fontFamily: fonts.bold, fontSize: 15, color: colors.brownMid },
  sheetSave: { fontFamily: fonts.black, fontSize: 15, color: colors.rose },
  sheetBody: { padding: 20, paddingBottom: 40 },
  sheetIntro: {
    fontFamily: fonts.bold,
    fontSize: 14,
    lineHeight: 20,
    color: colors.brownMid,
    marginBottom: 16,
    textAlign: 'center',
  },
});
