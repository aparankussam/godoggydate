import { useMemo, useRef, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { colors, fonts, radius, shadow } from '../constants/theme';
import { uploadDogPhoto } from '../lib/storage';
import type { SavedDogProfile } from '../lib/profile';

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

const PLAY_STYLE_OPTIONS = [
  'loves fetch 🎾',
  'wrestling 🤼',
  'gentle play 🐾',
  'high-energy runner ⚡',
  'calm 🧘',
  'explorer 👃',
] as const;

const ENERGY_OPTIONS = [20, 40, 60, 80, 100];

type ValidationErrors = Partial<Record<
  'photos' | 'name' | 'breed' | 'age' | 'sex' | 'size' | 'playStyles' | 'zip' | 'city' | 'state',
  string
>>;

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
  const [name, setName] = useState(initialProfile?.name ?? '');
  const [breed, setBreed] = useState(initialProfile?.breed ?? '');
  const [age, setAge] = useState<SavedDogProfile['age'] | ''>(initialProfile?.age ?? '');
  const [sex, setSex] = useState<SavedDogProfile['sex'] | ''>(initialProfile?.sex ?? '');
  const [size, setSize] = useState<SavedDogProfile['size']>(initialProfile?.size ?? 'M');
  const [energyLevel, setEnergyLevel] = useState(initialProfile?.energyLevel ?? 60);
  const [playStyles, setPlayStyles] = useState<string[]>(initialProfile?.playStyles ?? []);
  const [vaccinated, setVaccinated] = useState(initialProfile?.vaccinated ?? true);
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

  const nameRef = useRef<TextInput | null>(null);
  const breedRef = useRef<TextInput | null>(null);
  const zipRef = useRef<TextInput | null>(null);
  const cityRef = useRef<TextInput | null>(null);
  const stateRef = useRef<TextInput | null>(null);

  const locationLabel = useMemo(() => {
    if (zip.trim()) return zip.trim();
    if (city.trim() && usState.trim()) return `${city.trim()}, ${usState.trim().toUpperCase()}`;
    return initialProfile?.location ?? '';
  }, [city, initialProfile?.location, usState, zip]);

  function validate(): ValidationErrors {
    const next: ValidationErrors = {};
    if (photos.length < 3) next.photos = 'Add at least 3 photos';
    if (!name.trim()) next.name = 'Enter your dog’s name';
    if (!breed.trim()) next.breed = 'Enter your dog’s breed';
    if (!age) next.age = 'Choose an age';
    if (!sex) next.sex = 'Choose male or female';
    if (!size) next.size = 'Choose a size';
    if (playStyles.length === 0) next.playStyles = 'Pick at least 1 play style';

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

  function focusFirstInvalid(next: ValidationErrors) {
    if (next.name) return nameRef.current?.focus();
    if (next.breed) return breedRef.current?.focus();
    if (next.zip) return zipRef.current?.focus();
    if (next.city) return cityRef.current?.focus();
    if (next.state) return stateRef.current?.focus();
  }

  async function pickPhoto() {
    if (photos.length >= 6) return;

    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Photo access needed', 'Allow photo access to upload your dog’s photos.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
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

  async function handleSubmit() {
    const nextErrors = validate();
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      focusFirstInvalid(nextErrors);
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

      await onSubmit({
        name: name.trim(),
        breed: breed.trim(),
        age: age || 'adult',
        sex: sex || 'M',
        size,
        energyLevel,
        playStyles,
        vaccinated,
        photos: safePhotos,
        location: locationLabel,
        city: city.trim() || undefined,
        state: usState.trim().toUpperCase() || undefined,
        zip: zip.trim() || undefined,
        prompts: initialProfile?.prompts ?? [],
        temperament: initialProfile?.temperament ?? [],
      });
    } finally {
      setUploading(false);
    }
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Set up your dog’s profile</Text>
      <Text style={styles.subtitle}>This Phase 1 mobile beta focuses on auth, profile setup, and photo upload.</Text>

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
          placeholder="Labrador"
          placeholderTextColor={colors.brownLight}
          value={breed}
          onChangeText={setBreed}
        />
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
        <View style={styles.row}>
          {ENERGY_OPTIONS.map((option) => (
            <ChoiceChip
              key={option}
              label={`${option}`}
              active={energyLevel === option}
              onPress={() => setEnergyLevel(option)}
            />
          ))}
        </View>
      </Field>

      <Field label="Play style" error={errors.playStyles}>
        <View style={styles.wrap}>
          {PLAY_STYLE_OPTIONS.map((option) => (
            <ChoiceChip
              key={option}
              label={option}
              active={playStyles.includes(option)}
              onPress={() => setPlayStyles((prev: string[]) => (
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

      <View style={styles.switchRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.label}>Vaccinated</Text>
          <Text style={styles.helper}>Shown on your profile card.</Text>
        </View>
        <Switch value={vaccinated} onValueChange={setVaccinated} />
      </View>

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
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 24,
    paddingVertical: 6,
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
