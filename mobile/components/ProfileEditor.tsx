import { useMemo, useRef, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { colors, fonts, radius, shadow } from '../constants/theme';
import { uploadDogPhoto } from '../lib/storage';
import { isProfileComplete, type SavedDogProfile } from '../lib/profile';
import {
  canUseVibeCheck,
  localPhotosToDataUris,
  requestVibeCheck,
  VIBE_CHECK_SIGN_IN_MESSAGE,
} from '../lib/vibeCheck';
import { getVaccinationStatus } from '../../shared/profile';
import { BREEDS } from '../../shared/types/breeds';
import { checkContent, checkContentFields, CONTENT_FILTER_MESSAGE } from '../../shared/contentFilter';
import {
  birthFieldsFromPartial,
  formatUsPartial,
  isBirthYearInRange,
  maskUsDateInput,
  parseUsDateInput,
  partialFromAdoptionDate,
  partialFromBirthFields,
  partialFromIsoDate,
  toAdoptionDateIso,
  toIsoDate,
  MIN_BIRTH_YEAR,
} from '../../shared/dates';

const AGE_OPTIONS = [
  { value: 'puppy', label: 'Puppy' },
  { value: 'adult', label: 'Adult' },
  { value: 'senior', label: 'Senior' },
] as const;

const SEX_OPTIONS = [
  { value: 'M', label: 'Male' },
  { value: 'F', label: 'Female' },
] as const;

const SIZE_OPTIONS = [
  { value: 'S', label: 'Small' },
  { value: 'M', label: 'Medium' },
  { value: 'L', label: 'Large' },
  { value: 'XL', label: 'XL' },
] as const;

// Same lists as web/components/DogProfileForm.tsx.
const TEMPERAMENT_OPTIONS: readonly string[] = [
  'Friendly 😊', 'Playful 🎮', 'Gentle 🕊️', 'Energetic ⚡',
  'Calm 🧘', 'Independent 🦅', 'Social butterfly 🦋', 'Shy at first 🙈',
];

const PLAY_STYLE_OPTIONS = [
  'loves fetch 🎾',
  'wrestling 🤼',
  'gentle play 🐾',
  'high-energy runner ⚡',
  'calm 🧘',
  'explorer 👃',
] as const;

const DEFAULT_PROMPTS: readonly string[] = [
  "My dog's personality in 3 words:",
  'Perfect playdate looks like:',
  'Things my dog loves:',
];

// The breed list web's datalist offers (web/components/DogProfileForm.tsx).
const BREED_NAMES: readonly string[] = Array.from(new Set([
  ...BREEDS.map((breedOption) => breedOption.name),
  'Mixed Breed',
  'Unknown Mix',
]));

const MAX_BREED_SUGGESTIONS = 6;

// Web's slider runs 10–100 in steps of 5. Ten taps cover the same range
// without a slider package; a value set elsewhere (web, Vibe Check) is kept
// exactly as stored unless the owner taps a new one.
const ENERGY_STEPS = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
const ENERGY_MIN = 10;
const ENERGY_MAX = 100;

function clampEnergy(value: number): number {
  return Math.max(ENERGY_MIN, Math.min(ENERGY_MAX, Math.round(value)));
}

const SIZE_VALUES: ReadonlyArray<SavedDogProfile['size']> = ['S', 'M', 'L', 'XL'];

// The 9 sections web's progress bar counts (countComplete in DogProfileForm.tsx).
const PROGRESS_SECTIONS = 9;

// Safety screening — mirrors web/components/DogProfileForm.tsx. These two
// lists are the ONLY inputs detectUnsafePairings() reads
// (shared/utils/matchingEngine.ts); nothing collected them on either platform
// before, so the engine could never emit a warning. Values must match the
// NotGoodWith / BehaviorFlag unions in shared/types.
const NOT_GOOD_WITH_OPTIONS = [
  'small dogs', 'large dogs', 'puppies',
  'high-energy dogs', 'rough play', 'off-leash dogs',
] as const;

const BEHAVIOR_FLAG_OPTIONS = [
  'needs slow introduction', 'easily overstimulated', 'resource guarding',
  'anxious with dogs', 'prefers calm dogs', 'not comfortable with kids',
  'reactive on leash only',
] as const;

// Two explicit answers plus a third state — neither selected — which is the
// initial one. "Vaccinated" carries no ✓ or checkmark styling anywhere: it is
// the owner's word, not a record.
const VACCINATED_CHOICES = [
  { value: true, label: 'Vaccinated' },
  { value: false, label: 'Not currently' },
] as const;

type ValidationErrors = Partial<Record<
  'photos' | 'name' | 'breed' | 'age' | 'sex' | 'size' | 'personality' | 'zip' | 'city' | 'state'
  | 'prompts' | 'rabiesExpiry' | 'birthDate' | 'adoptionDate',
  string
>>;

interface VibeCheckSummary {
  bio: string;
  archetypeName: string;
  archetypeDescription: string;
}

// Mirrors countComplete in web/components/DogProfileForm.tsx so both progress
// bars say the same thing about the same profile.
function countComplete(p: {
  photos: number;
  name: string;
  breed: string;
  age: string;
  sex: string;
  size: string;
  energyLevel: number;
  temperament: string[];
  playStyles: string[];
  city: string;
}): number {
  let n = 0;
  if (p.photos > 0) n++;
  if (p.name.trim()) n++;
  if (p.breed.trim()) n++;
  if (p.age) n++;
  if (p.sex) n++;
  if (p.size) n++;
  if (Number.isFinite(p.energyLevel)) n++;
  if (p.temperament.length >= 1 || p.playStyles.length >= 1) n++;
  if (p.city.trim()) n++;
  return n;
}

interface PhotoItem {
  id: string;
  uri: string;
  remoteUrl?: string;
  fileName?: string;
  mimeType?: string;
}

interface Props {
  userId: string;
  initialProfile?: SavedDogProfile | null;
  saving: boolean;
  submitLabel: string;
  onSubmit: (profile: SavedDogProfile) => Promise<void>;
}

export default function ProfileEditor({
  userId,
  initialProfile,
  saving,
  submitLabel,
  onSubmit,
}: Props) {
  const hasExistingProfile = Boolean(initialProfile);
  const profileIsComplete = isProfileComplete(initialProfile);
  const [name, setName] = useState(initialProfile?.name ?? '');
  const [breed, setBreed] = useState(initialProfile?.breed ?? '');
  const [age, setAge] = useState<SavedDogProfile['age'] | ''>(initialProfile?.age ?? '');
  const [sex, setSex] = useState<SavedDogProfile['sex'] | ''>(initialProfile?.sex ?? '');
  const [size, setSize] = useState<SavedDogProfile['size']>(initialProfile?.size ?? 'M');
  const [energyLevel, setEnergyLevel] = useState(initialProfile?.energyLevel ?? 60);
  const [temperament, setTemperament] = useState<string[]>(initialProfile?.temperament ?? []);
  const [playStyles, setPlayStyles] = useState<string[]>(initialProfile?.playStyles ?? []);
  // The 3 web prompts, answered or not. Matched by prompt text, as web does.
  const [prompts, setPrompts] = useState(
    DEFAULT_PROMPTS.map((prompt) => ({
      prompt,
      answer: initialProfile?.prompts?.find((item) => item.prompt === prompt)?.answer ?? '',
    })),
  );
  const [breedFocused, setBreedFocused] = useState(false);
  const [notGoodWith, setNotGoodWith] = useState<string[]>(initialProfile?.notGoodWith ?? []);
  const [behaviorFlags, setBehaviorFlags] = useState<string[]>(initialProfile?.behaviorFlags ?? []);
  // `?? true` before, which recorded a default as though it were an answer —
  // and the swipe card rendered it as a verification. null is genuinely
  // unanswered and stays distinct from an explicit false, the only value the
  // matching engine treats as blocking.
  const [vaccinated, setVaccinated] = useState<boolean | null>(initialProfile?.vaccinated ?? null);
  // Rabies expiry is typed as US MM/DD/YYYY and stored as 'YYYY-MM-DD'.
  const [rabiesExpiry, setRabiesExpiry] = useState(
    formatUsPartial(partialFromIsoDate(initialProfile?.rabiesExpiry)),
  );
  // Birthday & Gotcha Day (both optional) — ONE US MM/DD/YYYY box each, still
  // stored as the same three numbers / polymorphic string as before. Partial
  // entry is preserved: a rescue owner who only knows the month can type
  // "06/2021", and a birthday can even be year-only.
  const [birthDate, setBirthDate] = useState(
    formatUsPartial(partialFromBirthFields(
      initialProfile?.birthYear, initialProfile?.birthMonth, initialProfile?.birthDay,
    )),
  );
  const [adoptionDate, setAdoptionDate] = useState(
    formatUsPartial(partialFromAdoptionDate(initialProfile?.adoptionDate)),
  );
  const [zip, setZip] = useState(initialProfile?.zip ?? '');
  const [city, setCity] = useState(initialProfile?.city ?? '');
  const [usState, setUsState] = useState(initialProfile?.state ?? '');
  const [photos, setPhotos] = useState<PhotoItem[]>(
    (initialProfile?.photos ?? [])
      .filter((url) => url && !url.startsWith('_'))
      .map((url, index) => ({
        id: `existing-${index}`,
        uri: url,
        remoteUrl: url,
      })),
  );
  const [uploading, setUploading] = useState(false);
  const [errors, setErrors] = useState<ValidationErrors>({});

  // Vibe Check — photos in, pre-filled fields out. Mirrors web: it fills the
  // fields below and the owner reviews and saves them as usual. The server
  // saves the bio and archetype to dogs/{uid}.ai on its own.
  const [vibeChecking, setVibeChecking] = useState(false);
  const [vibeCheckError, setVibeCheckError] = useState<string | null>(null);
  const [vibeCheckResult, setVibeCheckResult] = useState<VibeCheckSummary | null>(null);

  const nameRef = useRef<TextInput | null>(null);
  const breedRef = useRef<TextInput | null>(null);
  const zipRef = useRef<TextInput | null>(null);
  const cityRef = useRef<TextInput | null>(null);
  const stateRef = useRef<TextInput | null>(null);
  const promptRefs = useRef<Array<TextInput | null>>([]);

  // Same helper the web form and the swipe card use, so the preview below
  // cannot drift from what other owners are actually shown.
  const vaccinationPreview = useMemo(() => {
    // rabiesExpiry state is US MM/DD/YYYY; getVaccinationStatus reads strict
    // ISO, so convert at this boundary or the preview silently drops the date.
    const parsed = parseUsDateInput(rabiesExpiry);
    return getVaccinationStatus({
      rabiesExpiry: parsed.ok ? toIsoDate(parsed.value) : null,
      vaccinated,
    });
  }, [rabiesExpiry, vaccinated]);

  const locationLabel = useMemo(() => {
    if (zip.trim()) return zip.trim();
    if (city.trim() && usState.trim()) return `${city.trim()}, ${usState.trim().toUpperCase()}`;
    return initialProfile?.location ?? '';
  }, [city, initialProfile?.location, usState, zip]);

  // Breed suggestions from the same list web offers. Names that start with
  // what's typed come first; hidden once the field matches one exactly.
  const breedSuggestions = useMemo(() => {
    const query = breed.trim().toLowerCase();
    if (!query) return [];
    const starts: string[] = [];
    const contains: string[] = [];
    for (const option of BREED_NAMES) {
      const lower = option.toLowerCase();
      if (lower === query) return [];
      if (lower.startsWith(query)) starts.push(option);
      else if (lower.includes(query)) contains.push(option);
    }
    return [...starts, ...contains].slice(0, MAX_BREED_SUGGESTIONS);
  }, [breed]);

  // Values Vibe Check (or web) saved that aren't one of the chips still show
  // up as chips, so the owner can see them and tap to remove them.
  const temperamentChoices = useMemo(
    () => [...TEMPERAMENT_OPTIONS, ...temperament.filter((item) => !TEMPERAMENT_OPTIONS.includes(item))],
    [temperament],
  );

  // Progress bar + "what's missing" — the same rule web uses: isProfileComplete
  // from shared/profile.ts, where temperament OR play style is enough.
  const zipStr = zip.trim();
  const cityStr = city.trim();
  const stateStr = usState.trim().toUpperCase();
  const completedCount = countComplete({
    photos: photos.length,
    name,
    breed,
    age: age || '',
    sex: sex || '',
    size,
    energyLevel,
    temperament,
    playStyles,
    city: zipStr || cityStr,
  });
  const progressPct = Math.round((completedCount / PROGRESS_SECTIONS) * 100);
  const complete = isProfileComplete({
    name: name.trim(),
    breed: breed.trim(),
    age: age || undefined,
    sex: sex || undefined,
    size,
    energyLevel,
    temperament,
    playStyles,
    // Count every selected photo, local or uploaded — the local ones upload
    // for real on save (same reasoning as web's photosForCheck).
    photos: Array(photos.length).fill('_placeholder_'),
    location: zipStr || (cityStr && stateStr ? `${cityStr}, ${stateStr}` : ''),
    city: cityStr || undefined,
    state: stateStr || undefined,
    zip: zipStr || undefined,
  });

  function toggleIn(list: string[], item: string): string[] {
    return list.includes(item) ? list.filter((value) => value !== item) : [...list, item];
  }

  function setPromptAnswer(index: number, answer: string) {
    setPrompts((prev) => prev.map((item, i) => (i === index ? { ...item, answer } : item)));
  }

  async function handleVibeCheck() {
    if (vibeChecking) return;
    if (photos.length === 0) {
      setVibeCheckError('Add at least one photo first');
      return;
    }
    if (!canUseVibeCheck()) {
      // Guests: the server refuses AI routes for anonymous sessions.
      setVibeCheckError(VIBE_CHECK_SIGN_IN_MESSAGE);
      return;
    }

    setVibeChecking(true);
    setVibeCheckError(null);
    try {
      // Like web: photos picked in this session go up inline; when there are
      // none (or none the route can take), the server reads the photos
      // already saved on the dog doc.
      const localPhotos = photos.filter((photo) => !photo.remoteUrl);
      const inline = localPhotos.length > 0
        ? await localPhotosToDataUris(localPhotos.map((photo) => ({ uri: photo.uri, mimeType: photo.mimeType })))
        : [];
      const hasSavedPhotos = photos.some((photo) => photo.remoteUrl);
      if (inline.length === 0 && !hasSavedPhotos) {
        // Too big to send from the phone, or a type the route doesn't take.
        // Once saved, the server reads them from Storage itself.
        throw new Error('Couldn’t send these photos from here. Save your profile, then try again.');
      }

      const ai = await requestVibeCheck(
        inline.length > 0
          ? { name, photos: inline }
          : { name, useStoredPhotos: true },
      );
      const vc = ai.vibeCheck;
      if (!vc) throw new Error('Vibe Check failed — try again');

      // Pre-fill, don't save — the owner checks these over and saves the form.
      if (vc.breedGuess?.name) setBreed(vc.breedGuess.name);
      const sizeGuess = SIZE_VALUES.find((value) => value === vc.sizeEstimate);
      if (sizeGuess) setSize(sizeGuess);
      if (typeof vc.energyEstimate === 'number' && Number.isFinite(vc.energyEstimate)) {
        setEnergyLevel(clampEnergy(vc.energyEstimate));
      }
      if (Array.isArray(vc.playStyleGuesses) && vc.playStyleGuesses.length > 0) setPlayStyles([...vc.playStyleGuesses]);
      if (Array.isArray(vc.temperamentGuesses) && vc.temperamentGuesses.length > 0) setTemperament([...vc.temperamentGuesses]);
      setErrors((prev) => ({ ...prev, breed: undefined, size: undefined, personality: undefined }));
      setVibeCheckResult({
        bio: vc.bio,
        archetypeName: vc.archetype?.name ?? '',
        archetypeDescription: vc.archetype?.description ?? '',
      });
    } catch (error) {
      setVibeCheckError(error instanceof Error ? error.message : 'Vibe Check failed — try again');
    } finally {
      setVibeChecking(false);
    }
  }

  function validate(): ValidationErrors {
    const next: ValidationErrors = {};
    if (photos.length < 3) next.photos = 'Add at least 3 photos';
    if (!name.trim()) next.name = 'Enter your dog’s name';
    if (!breed.trim()) next.breed = 'Enter your dog’s breed';
    if (!age) next.age = 'Choose an age';
    if (!sex) next.sex = 'Choose male or female';
    if (!size) next.size = 'Choose a size';
    // Temperament OR play style, the same rule as isProfileComplete and web.
    if (temperament.length === 0 && playStyles.length === 0) {
      next.personality = 'Pick at least one temperament or play style';
    }

    // The three date fields below are all OPTIONAL — blank stays valid and
    // still clears the stored value. But a NON-EMPTY value that can't be parsed
    // MUST block the save: every one of these used to coerce silently to null,
    // and because saves are { merge: true } that null is written — so a single
    // typo would permanently delete a date the owner had already entered
    // correctly. Erroring is what makes a free-text date box safe.
    if (rabiesExpiry.trim()) {
      const parsed = parseUsDateInput(rabiesExpiry);
      // A past date is valid input and must stay savable — "expired" is exactly
      // what this field is for.
      if (!parsed.ok || !toIsoDate(parsed.value)) {
        next.rabiesExpiry = 'Use MM/DD/YYYY, like 04/18/2027';
      }
    }

    if (birthDate.trim()) {
      const parsed = parseUsDateInput(birthDate);
      if (!parsed.ok) {
        next.birthDate = 'Use MM/DD/YYYY — or just 06/2021, or 2021';
      } else if (!isBirthYearInRange(parsed.value.year)) {
        next.birthDate = `Year must be between ${MIN_BIRTH_YEAR} and ${new Date().getFullYear()}`;
      }
    }

    if (adoptionDate.trim()) {
      const parsed = parseUsDateInput(adoptionDate);
      if (!parsed.ok) {
        next.adoptionDate = 'Use MM/DD/YYYY — or just 06/2021';
      } else if (!toAdoptionDateIso(parsed.value)) {
        // Year-only has no stored form for Gotcha Day, so say so rather than
        // inventing a January date and firing a wrong celebration.
        next.adoptionDate = 'Add at least the month, like 06/2021';
      }
    }

    const trimmedZip = zip.trim();
    const trimmedCity = city.trim();
    const trimmedState = usState.trim().toUpperCase();
    const zipValid = /^\d{5}(-\d{4})?$/.test(trimmedZip);

    if (trimmedZip) {
      if (!zipValid) next.zip = 'Use a valid ZIP code';
    } else {
      if (!trimmedCity) next.city = 'Enter a city or use ZIP';
      if (!trimmedState) next.state = 'Enter a 2-letter state';
      else if (!/^[A-Z]{2}$/.test(trimmedState)) next.state = 'Use 2 letters, like MI';
    }

    return next;
  }

  function focusFirstInvalid(next: ValidationErrors, promptIndex = 0) {
    if (next.name) return nameRef.current?.focus();
    if (next.breed) return breedRef.current?.focus();
    if (next.zip) return zipRef.current?.focus();
    if (next.city) return cityRef.current?.focus();
    if (next.state) return stateRef.current?.focus();
    if (next.prompts) return promptRefs.current[promptIndex]?.focus();
  }

  // Apple guideline 1.2 / item A3: every free-text field this form writes goes
  // through the shared content filter before anything is saved. Returns the
  // field errors to show, or null when the text is fine.
  function contentFilterErrors(): { errors: ValidationErrors; promptIndex: number } | null {
    // Temperament is chips, but Vibe Check can add its own words there, and
    // those get saved as text too.
    const customTemperament = temperament.filter((item) => !TEMPERAMENT_OPTIONS.includes(item));
    const result = checkContentFields([
      name,
      breed,
      zip,
      city,
      usState,
      ...prompts.map((item) => item.answer),
      ...customTemperament,
    ]);
    if (result.ok) return null;

    const flagged = (text: string) => !checkContent(text).ok;
    const next: ValidationErrors = {};
    if (flagged(name)) next.name = CONTENT_FILTER_MESSAGE;
    if (flagged(breed)) next.breed = CONTENT_FILTER_MESSAGE;
    if (flagged(zip)) next.zip = CONTENT_FILTER_MESSAGE;
    if (flagged(city)) next.city = CONTENT_FILTER_MESSAGE;
    if (flagged(usState)) next.state = CONTENT_FILTER_MESSAGE;
    if (customTemperament.some(flagged)) next.personality = CONTENT_FILTER_MESSAGE;
    const promptIndex = prompts.findIndex((item) => flagged(item.answer));
    if (promptIndex >= 0) next.prompts = CONTENT_FILTER_MESSAGE;
    return { errors: next, promptIndex: Math.max(0, promptIndex) };
  }

  async function pickPhoto() {
    if (photos.length >= 6) return;

    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Photo access needed', 'Allow photo access to upload your dog’s photos.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      quality: 0.8,
    });

    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    setPhotos((prev: PhotoItem[]) => [
      ...prev,
      {
        id: `${Date.now()}-${prev.length}`,
        uri: asset.uri,
        fileName: asset.fileName ?? `dog-photo-${Date.now()}.jpg`,
        mimeType: asset.mimeType ?? 'image/jpeg',
      },
    ]);
    setErrors((prev: ValidationErrors) => ({ ...prev, photos: '' }));
  }

  function removePhoto(id: string) {
    setPhotos((prev: PhotoItem[]) => prev.filter((photo: PhotoItem) => photo.id !== id));
  }

  // The URL the owner's cover pick currently points at, captured once from the
  // profile as loaded. Mobile has no cover picker (the pick is made on web), but
  // it CAN remove/reorder photos — and it never wrote coverPhotoIndex, so the
  // stale stored index survived { merge: true } and silently began pointing at a
  // different photo on every surface that resolves the hero. Re-deriving the
  // index from this URL at save time keeps the owner's pick attached to the
  // photo they actually chose, and clears it honestly when that photo is gone.
  const initialCoverUrl = useMemo(() => {
    const real = (initialProfile?.photos ?? []).filter((u) => u && !u.startsWith('_'));
    const idx = initialProfile?.coverPhotoIndex;
    return typeof idx === 'number' && idx >= 0 && idx < real.length ? real[idx] : null;
  }, [initialProfile]);

  async function handleSubmit() {
    const nextErrors = validate();
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      focusFirstInvalid(nextErrors);
      return;
    }

    const filtered = contentFilterErrors();
    if (filtered) {
      setErrors(filtered.errors);
      Alert.alert('Please rephrase', CONTENT_FILTER_MESSAGE);
      focusFirstInvalid(filtered.errors, filtered.promptIndex);
      return;
    }

    setUploading(true);
    try {
      const uploadedPhotos: string[] = [];
      for (const photo of photos) {
        if (photo.remoteUrl) {
          uploadedPhotos.push(photo.remoteUrl);
          continue;
        }

        const uploaded = await uploadDogPhoto(
          userId,
          photo.uri,
          photo.fileName ?? `dog-photo-${Date.now()}.jpg`,
          photo.mimeType ?? 'image/jpeg',
        );
        uploadedPhotos.push(uploaded);
      }

      const safePhotos = uploadedPhotos.slice(0, 6);
      while (safePhotos.length < 3) safePhotos.push('_placeholder_');

      // Re-point the owner's cover pick at the photo it actually names (see
      // initialCoverUrl). null — not undefined — when that photo is gone, so
      // the { merge: true } write really clears the stale index instead of
      // leaving it to select an unrelated photo.
      const nextCoverIndex = (() => {
        if (!initialCoverUrl) return null;
        const i = safePhotos.indexOf(initialCoverUrl);
        return i >= 0 ? i : null;
      })();

      await onSubmit({
        name: name.trim(),
        breed: breed.trim(),
        age: age || 'adult',
        sex: sex || 'M',
        size,
        energyLevel,
        playStyles,
        notGoodWith,
        behaviorFlags,
        vaccinated,
        // null, not undefined, when empty: saves are { merge: true } and
        // stripUndefined drops undefined keys, so omitting it would leave a
        // date the owner just deleted in place.
        // Typed as US MM/DD/YYYY, stored as 'YYYY-MM-DD' — the stored shape is
        // unchanged. validate() has already blocked a non-empty-but-unparseable
        // value, so reaching null here means the owner really did clear it.
        rabiesExpiry: (() => {
          const parsed = parseUsDateInput(rabiesExpiry);
          return parsed.ok ? toIsoDate(parsed.value) : null;
        })(),
        // Birthday & Gotcha Day — the SAME stored fields and rules as before,
        // now derived by the shared helpers. null (not undefined) when empty so
        // a cleared value actually clears under { merge: true }.
        ...(() => {
          const parsed = parseUsDateInput(birthDate);
          return birthFieldsFromPartial(parsed.ok ? parsed.value : null);
        })(),
        adoptionDate: (() => {
          const parsed = parseUsDateInput(adoptionDate);
          return parsed.ok ? toAdoptionDateIso(parsed.value) : null;
        })(),
        photos: safePhotos,
        coverPhotoIndex: nextCoverIndex,
        location: locationLabel,
        city: city.trim() || undefined,
        state: usState.trim().toUpperCase() || undefined,
        zip: zip.trim() || undefined,
        // Answered prompts only, as web saves them. Any prompt that isn't one
        // of the 3 editable ones is kept as it was rather than dropped.
        prompts: [
          ...prompts
            .map((item) => ({ prompt: item.prompt, answer: item.answer.trim() }))
            .filter((item) => item.answer),
          ...(initialProfile?.prompts ?? []).filter((item) => !DEFAULT_PROMPTS.includes(item.prompt)),
        ],
        temperament,
      });
    } finally {
      setUploading(false);
    }
  }

  return (
    // "handled" so a tap on a breed suggestion (or any chip) lands while the
    // keyboard is up, instead of only dismissing the keyboard.
    <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Text style={styles.title}>
        {profileIsComplete
          ? 'Edit your dog’s profile'
          : hasExistingProfile
            ? 'Finish your dog’s profile'
            : 'Set up your dog’s profile'}
      </Text>
      <Text style={styles.subtitle}>
        {profileIsComplete
          ? 'Update photos, details, and play preferences for your returning profile.'
          : hasExistingProfile
            ? 'Your profile is saved, but a few required details are still missing before discovery unlocks.'
            : 'Add your dog’s photos and a few details to get started.'}
      </Text>

      {/* Progress — mirrors the bar at the top of web's DogProfileForm. */}
      <View style={styles.progressWrap}>
        <View style={styles.progressRow}>
          <Text style={styles.progressCount}>{completedCount}/{PROGRESS_SECTIONS} sections complete</Text>
          <Text style={[styles.progressStatus, complete && styles.progressStatusDone]}>
            {complete ? '✓ Ready to swipe!' : `${progressPct}% — complete to unlock swipe`}
          </Text>
        </View>
        <View
          style={styles.progressTrack}
          accessible
          accessibilityRole="progressbar"
          accessibilityLabel="Profile progress"
          accessibilityValue={{ min: 0, max: 100, now: progressPct }}
        >
          <View
            style={[
              styles.progressFill,
              { width: `${progressPct}%`, backgroundColor: complete ? colors.success : colors.primary },
            ]}
          />
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.label}>Photos</Text>
        <Text style={styles.helper}>Add at least 3 photos. You can upload up to 6.</Text>
        <View style={styles.photoGrid}>
          {photos.map((photo) => (
            <View key={photo.id} style={styles.photoWrap}>
              <Image source={{ uri: photo.uri }} style={styles.photo} />
              <Pressable style={styles.removePhoto} onPress={() => removePhoto(photo.id)}>
                <Text style={styles.removePhotoText}>×</Text>
              </Pressable>
            </View>
          ))}
          {photos.length < 6 && (
            <Pressable style={styles.addPhoto} onPress={pickPhoto}>
              <Text style={styles.addPhotoPlus}>+</Text>
              <Text style={styles.addPhotoText}>Add photo</Text>
            </Pressable>
          )}
        </View>
        {errors.photos ? <Text style={styles.error}>{errors.photos}</Text> : null}

        {/* Vibe Check — offered whenever there's any photo, saved or new,
            exactly as web does (DogProfileForm.tsx). */}
        {photos.length > 0 && !vibeCheckResult && (
          <Pressable
            style={[styles.vibeButton, vibeChecking && styles.vibeButtonBusy]}
            onPress={handleVibeCheck}
            disabled={vibeChecking}
            accessibilityRole="button"
            accessibilityLabel={initialProfile?.ai?.vibeCheck ? 'Redo the Vibe Check' : 'Fill this in from the photos'}
            accessibilityHint="Guesses breed, size, energy and personality from your photos. You can change anything before saving."
          >
            {vibeChecking ? (
              <View style={styles.vibeBusyRow}>
                <ActivityIndicator color={colors.brown} size="small" />
                <Text style={styles.vibeButtonText}>Reading the photos…</Text>
              </View>
            ) : (
              <Text style={styles.vibeButtonText}>
                {initialProfile?.ai?.vibeCheck ? '✨ Redo the Vibe Check' : '✨ Fill this in from the photos'}
              </Text>
            )}
          </Pressable>
        )}
        {vibeCheckError ? <Text style={styles.error}>{vibeCheckError}</Text> : null}
        {vibeCheckResult && (
          <View style={styles.vibeResult}>
            {vibeCheckResult.archetypeName ? (
              <Text style={styles.vibeArchetype}>{vibeCheckResult.archetypeName}</Text>
            ) : null}
            <Text style={styles.vibeBio}>“{vibeCheckResult.bio}”</Text>
            {vibeCheckResult.archetypeDescription ? (
              <Text style={styles.vibeDescription}>{vibeCheckResult.archetypeDescription}</Text>
            ) : null}
            <Text style={styles.vibeNote}>
              Filled in breed, size, energy, and tags below — check them over.
            </Text>
          </View>
        )}
      </View>

      <Field label="Dog’s name" error={errors.name}>
        <TextInput
          ref={nameRef}
          style={styles.input}
          placeholder="Kaju"
          placeholderTextColor={colors.brownLight}
          value={name}
          onChangeText={setName}
        />
      </Field>

      <Field label="Breed" error={errors.breed}>
        <TextInput
          ref={breedRef}
          style={styles.input}
          placeholder="e.g. Golden Retriever, Dachshund Mix"
          placeholderTextColor={colors.brownLight}
          value={breed}
          onChangeText={setBreed}
          onFocus={() => setBreedFocused(true)}
          onBlur={() => setBreedFocused(false)}
          autoCorrect={false}
        />
        {breedFocused && breedSuggestions.length > 0 && (
          <View style={[styles.wrap, styles.suggestions]}>
            {breedSuggestions.map((option) => (
              <Pressable
                key={option}
                style={styles.suggestionChip}
                accessibilityRole="button"
                accessibilityLabel={`Use ${option}`}
                onPress={() => {
                  setBreed(option);
                  breedRef.current?.blur();
                }}
              >
                <Text style={styles.suggestionText}>{option}</Text>
              </Pressable>
            ))}
          </View>
        )}
      </Field>

      <Field label="Age" error={errors.age}>
        <View style={styles.row}>
          {AGE_OPTIONS.map((option) => (
            <ChoiceChip
              key={option.value}
              label={option.label}
              active={age === option.value}
              onPress={() => setAge(option.value)}
            />
          ))}
        </View>
      </Field>

      <Field label="Sex" error={errors.sex}>
        <View style={styles.row}>
          {SEX_OPTIONS.map((option) => (
            <ChoiceChip
              key={option.value}
              label={option.label}
              active={sex === option.value}
              onPress={() => setSex(option.value)}
            />
          ))}
        </View>
      </Field>

      <Field label="Size" error={errors.size}>
        <View style={styles.row}>
          {SIZE_OPTIONS.map((option) => (
            <ChoiceChip
              key={option.value}
              label={option.label}
              active={size === option.value}
              onPress={() => setSize(option.value)}
            />
          ))}
        </View>
      </Field>

      <Field label={`Energy level ${energyLevel}%`}>
        {/* Ten steps standing in for web's 10–100 slider: tap a step to set
            it, and the bar fills up to there. VoiceOver gets an adjustable
            control (swipe up/down). */}
        <View
          style={styles.energyTrack}
          accessible
          accessibilityRole="adjustable"
          accessibilityLabel="Energy level"
          accessibilityValue={{ min: ENERGY_MIN, max: ENERGY_MAX, now: energyLevel, text: `${energyLevel}%` }}
          accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
          onAccessibilityAction={(event) => {
            const delta = event.nativeEvent.actionName === 'increment' ? 10 : -10;
            setEnergyLevel((prev) => clampEnergy(prev + delta));
          }}
        >
          {ENERGY_STEPS.map((step) => (
            <Pressable
              key={step}
              style={[styles.energyStep, energyLevel >= step && styles.energyStepActive]}
              onPress={() => setEnergyLevel(step)}
              hitSlop={{ top: 6, bottom: 6 }}
            />
          ))}
        </View>
        <View style={styles.energyLabels}>
          <Text style={styles.energyLabelText}>Chill 🧘</Text>
          <Text style={styles.energyLabelText}>Energetic ⚡</Text>
        </View>
      </Field>

      <Field label="Temperament (pick any)" error={errors.personality}>
        <View style={styles.wrap}>
          {temperamentChoices.map((option) => (
            <ChoiceChip
              key={option}
              label={option}
              active={temperament.includes(option)}
              onPress={() => setTemperament((prev) => toggleIn(prev, option))}
            />
          ))}
        </View>
      </Field>

      <Field label="Play style (pick any)">
        <View style={styles.wrap}>
          {PLAY_STYLE_OPTIONS.map((option) => (
            <ChoiceChip
              key={option}
              label={option}
              active={playStyles.includes(option)}
              onPress={() => setPlayStyles((prev) => toggleIn(prev, option))}
            />
          ))}
        </View>
      </Field>

      <Field label="Not a good match with">
        <View style={styles.wrap}>
          {NOT_GOOD_WITH_OPTIONS.map((option) => (
            <ChoiceChip
              key={option}
              label={option}
              active={notGoodWith.includes(option)}
              onPress={() => setNotGoodWith((prev: string[]) => (
                prev.includes(option) ? prev.filter((item: string) => item !== option) : [...prev, option]
              ))}
            />
          ))}
        </View>
      </Field>

      <Field label="Good to know before meeting">
        <View style={styles.wrap}>
          {BEHAVIOR_FLAG_OPTIONS.map((option) => (
            <ChoiceChip
              key={option}
              label={option}
              active={behaviorFlags.includes(option)}
              onPress={() => setBehaviorFlags((prev: string[]) => (
                prev.includes(option) ? prev.filter((item: string) => item !== option) : [...prev, option]
              ))}
            />
          ))}
        </View>
      </Field>

      <Field label="ZIP code">
        <TextInput
          ref={zipRef}
          style={styles.input}
          placeholder="48084"
          placeholderTextColor={colors.brownLight}
          value={zip}
          onChangeText={setZip}
          keyboardType="numbers-and-punctuation"
        />
        {errors.zip ? <Text style={styles.error}>{errors.zip}</Text> : null}
      </Field>

      <Text style={styles.orText}>or</Text>

      <Field label="City" error={errors.city}>
        <TextInput
          ref={cityRef}
          style={styles.input}
          placeholder="Troy"
          placeholderTextColor={colors.brownLight}
          value={city}
          onChangeText={setCity}
        />
      </Field>

      <Field label="State" error={errors.state}>
        <TextInput
          ref={stateRef}
          style={styles.input}
          placeholder="MI"
          placeholderTextColor={colors.brownLight}
          value={usState}
          onChangeText={(value: string) => setUsState(value.toUpperCase())}
          autoCapitalize="characters"
          maxLength={2}
        />
      </Field>

      {/* The 3 prompts web asks (DogProfileForm.tsx "About your dog"). */}
      <View style={styles.field}>
        <Text style={styles.label}>About your dog (optional)</Text>
        {prompts.map((item, index) => (
          <View key={item.prompt} style={styles.promptItem}>
            <Text style={styles.subLabel}>{item.prompt}</Text>
            <TextInput
              ref={(input) => { promptRefs.current[index] = input; }}
              style={styles.input}
              placeholder="Your answer…"
              placeholderTextColor={colors.brownLight}
              value={item.answer}
              onChangeText={(text) => setPromptAnswer(index, text)}
              accessibilityLabel={item.prompt}
            />
          </View>
        ))}
        {errors.prompts ? <Text style={styles.error}>{errors.prompts}</Text> : null}
      </View>

      {/* Birthday & milestones — powers Life Stage + the birthday/Gotcha Day
          celebration cards. All optional; none gate discovery. */}
      <View style={styles.vaccinationCard}>
        <Text style={styles.label}>🎂 Birthday &amp; milestones</Text>
        <Text style={styles.helper}>
          Optional — unlocks {name.trim() || 'your dog'}&apos;s life stage plus birthday and Gotcha Day celebrations.
        </Text>

        <Text style={styles.subLabel}>Birthday</Text>
        <TextInput
          style={[styles.input, errors.birthDate && styles.inputError]}
          placeholder="MM/DD/YYYY"
          placeholderTextColor={colors.brownLight}
          value={birthDate}
          // number-pad + an explicit mask, NOT numbers-and-punctuation: that
          // keyboard is iOS-only and falls back to the full keyboard on Android.
          onChangeText={(t) => setBirthDate(maskUsDateInput(t))}
          keyboardType="numbers-and-punctuation"
          autoCapitalize="none"
          maxLength={10}
        />
        {errors.birthDate ? <Text style={styles.error}>{errors.birthDate}</Text> : null}

        <Text style={styles.subLabel}>Gotcha Day — the day they came home</Text>
        <TextInput
          style={[styles.input, errors.adoptionDate && styles.inputError]}
          placeholder="MM/DD/YYYY"
          placeholderTextColor={colors.brownLight}
          value={adoptionDate}
          onChangeText={(t) => setAdoptionDate(maskUsDateInput(t))}
          keyboardType="numbers-and-punctuation"
          autoCapitalize="none"
          maxLength={10}
        />
        {errors.adoptionDate ? <Text style={styles.error}>{errors.adoptionDate}</Text> : null}

        <Text style={styles.helper}>
          Don&apos;t know the exact day? Month and year is enough — type 06/2021 and we&apos;ll celebrate the
          month. For the birthday, even just the year (2021) works.
        </Text>
      </View>

      {/* Vaccination — mirrors web/components/DogProfileForm.tsx. The Switch
          that used to sit here could not express "unanswered": it defaulted to
          on, so every mobile save recorded a vaccination "yes" the owner was
          never asked for, and the swipe card rendered that default as a green
          ✓. The date is the real artifact — read off the certificate, and the
          one boarding, daycare, groomers and landlords all ask for. */}
      <View style={styles.vaccinationCard}>
        <Text style={styles.label}>Vaccination</Text>
        <Text style={styles.helper}>
          Nobody verifies any of this. Other owners see it attributed to you, exactly as you enter it.
        </Text>

        <Text style={styles.subLabel}>Rabies expiry date (optional)</Text>
        <TextInput
          style={[styles.input, errors.rabiesExpiry && styles.inputError]}
          placeholder="MM/DD/YYYY"
          placeholderTextColor={colors.brownLight}
          value={rabiesExpiry}
          onChangeText={(t) => setRabiesExpiry(maskUsDateInput(t))}
          keyboardType="numbers-and-punctuation"
          autoCapitalize="none"
          maxLength={10}
        />
        <Text style={styles.helper}>
          The date printed on the certificate. Keep it here and you’ll stop digging through email for
          it at every check-in.
        </Text>
        {errors.rabiesExpiry ? <Text style={styles.error}>{errors.rabiesExpiry}</Text> : null}

        <Text style={styles.subLabel}>No certificate handy?</Text>
        <View style={styles.row}>
          {VACCINATED_CHOICES.map((choice) => (
            <ChoiceChip
              key={String(choice.value)}
              label={choice.label}
              active={vaccinated === choice.value}
              // Tapping the selected answer clears it back to null — without a
              // route back to "unanswered", a mis-tap would be permanent.
              onPress={() => setVaccinated(vaccinated === choice.value ? null : choice.value)}
            />
          ))}
        </View>
        <Text style={styles.helper}>
          Leave both off if you’d rather not say — tap a selected answer to clear it.
        </Text>

        {/* The exact string other owners will read, so there is no gap between
            what you entered and what the app claims on your behalf. */}
        <Text style={styles.previewText}>
          Others will see: <Text style={styles.previewValue}>{vaccinationPreview.label}</Text>
        </Text>
      </View>

      {/* What's still missing — the same checklist web shows above its save
          button. */}
      {!complete && (
        <View style={styles.missingCard}>
          <Text style={styles.missingTitle}>To unlock swiping, add:</Text>
          {photos.length < 3 && <Text style={styles.missingItem}>• At least 3 photos ({photos.length}/3)</Text>}
          {!name.trim() && <Text style={styles.missingItem}>• Dog’s name</Text>}
          {!breed.trim() && <Text style={styles.missingItem}>• Breed</Text>}
          {!age && <Text style={styles.missingItem}>• Age</Text>}
          {!sex && <Text style={styles.missingItem}>• Sex</Text>}
          {temperament.length === 0 && playStyles.length === 0 && (
            <Text style={styles.missingItem}>• At least one temperament or play style</Text>
          )}
          {!zipStr && !(cityStr && stateStr) && <Text style={styles.missingItem}>• ZIP code or city + state</Text>}
        </View>
      )}

      <Pressable
        style={[styles.submitButton, (saving || uploading) && styles.submitButtonDisabled]}
        onPress={handleSubmit}
        disabled={saving || uploading}
      >
        {saving || uploading ? (
          <ActivityIndicator color={colors.white} />
        ) : (
          <Text style={styles.submitText}>{submitLabel}</Text>
        )}
      </Pressable>
    </ScrollView>
  );
}

function Field({
  label,
  children,
  error,
}: {
  label: string;
  children: ReactNode;
  error?: string;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      {children}
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

function ChoiceChip({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable style={[styles.chip, active && styles.chipActive]} onPress={onPress}>
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.cream },
  content: { padding: 20, paddingBottom: 40 },
  title: {
    fontFamily: fonts.display,
    fontSize: 30,
    color: colors.brown,
    marginBottom: 8,
  },
  subtitle: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.brownLight,
    lineHeight: 20,
    marginBottom: 20,
  },
  section: { marginBottom: 18 },
  field: { marginBottom: 18 },
  progressWrap: { marginBottom: 20 },
  progressRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 6,
  },
  progressCount: { fontFamily: fonts.body, fontSize: 12, color: colors.brownLight },
  progressStatus: { fontFamily: fonts.semibold, fontSize: 12, color: colors.primary },
  progressStatusDone: { color: colors.success },
  progressTrack: {
    height: 8,
    borderRadius: radius.full,
    backgroundColor: colors.border,
    overflow: 'hidden',
  },
  progressFill: { height: '100%', borderRadius: radius.full },
  vibeButton: {
    marginTop: 14,
    borderWidth: 1,
    borderColor: `${colors.gold}80`, // ~50%
    backgroundColor: `${colors.gold}1A`, // ~10%
    borderRadius: radius.md,
    paddingVertical: 13,
    paddingHorizontal: 14,
    alignItems: 'center',
  },
  vibeButtonBusy: { opacity: 0.7 },
  vibeBusyRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  vibeButtonText: { fontFamily: fonts.bold, fontSize: 14, color: colors.brown },
  vibeResult: {
    marginTop: 14,
    borderWidth: 1,
    borderColor: `${colors.gold}66`, // ~40%
    backgroundColor: `${colors.gold}1A`,
    borderRadius: radius.lg,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  vibeArchetype: {
    fontFamily: fonts.bold,
    fontSize: 11,
    letterSpacing: 1.1,
    textTransform: 'uppercase',
    color: colors.brownMid,
  },
  vibeBio: { fontFamily: fonts.body, fontSize: 14, lineHeight: 20, color: colors.brown, marginTop: 4 },
  vibeDescription: { fontFamily: fonts.body, fontSize: 12, lineHeight: 17, color: colors.brownLight, marginTop: 8 },
  vibeNote: { fontFamily: fonts.body, fontSize: 11, color: colors.brownLight, marginTop: 8 },
  suggestions: { marginTop: 8 },
  suggestionChip: {
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.creamDark,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  suggestionText: { fontFamily: fonts.semibold, fontSize: 13, color: colors.brown },
  energyTrack: { flexDirection: 'row', gap: 4 },
  energyStep: {
    flex: 1,
    height: 32,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
  },
  energyStepActive: { borderColor: colors.primary, backgroundColor: colors.primary },
  energyLabels: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 },
  energyLabelText: { fontFamily: fonts.body, fontSize: 12, color: colors.brownLight },
  promptItem: { marginBottom: 10 },
  missingCard: {
    borderRadius: radius.lg,
    backgroundColor: colors.creamDark,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 18,
    gap: 2,
  },
  missingTitle: { fontFamily: fonts.semibold, fontSize: 14, color: colors.brownMid, marginBottom: 4 },
  missingItem: { fontFamily: fonts.body, fontSize: 12, color: colors.brownLight, lineHeight: 18 },
  label: {
    fontFamily: fonts.semibold,
    fontSize: 14,
    color: colors.brownMid,
    marginBottom: 8,
  },
  helper: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.brownLight,
    marginBottom: 10,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    paddingVertical: 13,
    fontFamily: fonts.body,
    fontSize: 16,
    color: colors.brown,
  },
  inputError: { borderColor: colors.primary },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  chipActive: {
    borderColor: colors.primary,
    backgroundColor: '#FDE4DA',
  },
  chipText: {
    fontFamily: fonts.semibold,
    color: colors.brown,
    fontSize: 13,
  },
  chipTextActive: { color: colors.primaryDark },
  photoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  photoWrap: { position: 'relative' },
  photo: { width: 92, height: 92, borderRadius: radius.md, backgroundColor: colors.creamDark },
  addPhoto: {
    width: 92,
    height: 92,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.white,
  },
  addPhotoPlus: {
    fontFamily: fonts.display,
    fontSize: 28,
    color: colors.primary,
  },
  addPhotoText: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.brownLight,
  },
  removePhoto: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.brown,
    alignItems: 'center',
    justifyContent: 'center',
  },
  removePhotoText: {
    color: colors.white,
    fontSize: 16,
    lineHeight: 18,
  },
  error: {
    marginTop: 6,
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.danger,
  },
  orText: {
    fontFamily: fonts.semibold,
    fontSize: 12,
    color: colors.brownLight,
    textAlign: 'center',
    marginBottom: 18,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  vaccinationCard: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    padding: 16,
    marginBottom: 24,
  },
  subLabel: {
    fontFamily: fonts.semibold,
    fontSize: 12,
    color: colors.brownMid,
    marginTop: 6,
    marginBottom: 8,
  },
  previewText: {
    marginTop: 12,
    borderRadius: radius.md,
    backgroundColor: colors.creamDark,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.brownMid,
  },
  previewValue: {
    fontFamily: fonts.semibold,
    color: colors.brown,
  },
  submitButton: {
    backgroundColor: colors.primary,
    borderRadius: radius.full,
    paddingVertical: 16,
    alignItems: 'center',
    ...shadow.button,
  },
  submitButtonDisabled: { opacity: 0.7 },
  submitText: {
    fontFamily: fonts.bold,
    fontSize: 16,
    color: colors.white,
  },
});
