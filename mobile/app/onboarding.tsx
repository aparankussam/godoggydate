import { useState, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Switch,
  Pressable,
  Animated,
  Alert,
} from 'react-native';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import * as ImagePicker from 'expo-image-picker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { colors, fonts, radius, shadow } from '../constants/theme';
import { DogProfile, DogSize, DogAge, PlayStyle, GoodWith, NotGoodWith } from '../../shared/types';
import { getFirebase } from '../../shared/utils/firebase';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';

const STEPS = ['Your Dog', 'Personality', 'Safety'] as const;
type Step = 0 | 1 | 2;

const SIZE_OPTIONS: { label: string; value: DogSize; emoji: string }[] = [
  { label: 'XS', value: 'XS', emoji: '🐭' },
  { label: 'Small', value: 'S', emoji: '🐕' },
  { label: 'Medium', value: 'M', emoji: '🦴' },
  { label: 'Large', value: 'L', emoji: '🐘' },
  { label: 'XL', value: 'XL', emoji: '🦁' },
];

const AGE_OPTIONS: { label: string; value: DogAge; emoji: string }[] = [
  { label: 'Puppy', value: 'puppy', emoji: '🍼' },
  { label: 'Adult', value: 'adult', emoji: '⭐' },
  { label: 'Senior', value: 'senior', emoji: '🌙' },
];

const PLAY_STYLE_OPTIONS: { label: string; value: PlayStyle; emoji: string }[] = [
  { label: 'Fetch', value: 'fetch', emoji: '🎾' },
  { label: 'Wrestling', value: 'wrestling', emoji: '🤼' },
  { label: 'Gentle', value: 'gentle', emoji: '🐾' },
  { label: 'Runner', value: 'runner', emoji: '⚡' },
  { label: 'Calm', value: 'calm', emoji: '🧘' },
  { label: 'Explorer', value: 'explorer', emoji: '👃' },
];

const GOOD_WITH_OPTIONS: { label: string; value: GoodWith }[] = [
  { label: 'Small dogs', value: 'small_dogs' },
  { label: 'Large dogs', value: 'large_dogs' },
  { label: 'Puppies', value: 'puppies' },
  { label: 'Calm dogs', value: 'calm_dogs' },
  { label: 'High-energy dogs', value: 'high_energy_dogs' },
];

const NOT_GOOD_WITH_OPTIONS: { label: string; value: NotGoodWith }[] = [
  { label: 'Small dogs', value: 'small_dogs' },
  { label: 'Puppies', value: 'puppies' },
  { label: 'Rough play', value: 'rough_play' },
  { label: 'Needs slow intro', value: 'needs_slow_intro' },
  { label: 'Easily overstimulated', value: 'easily_overstimulated' },
];

export default function OnboardingScreen() {
  const [step, setStep] = useState<Step>(0);
  const [name, setName] = useState('');
  const [breed, setBreed] = useState('');
  const [size, setSize] = useState<DogSize | null>(null);
  const [age, setAge] = useState<DogAge | null>(null);
  const [energy, setEnergy] = useState(60);
  const [sex, setSex] = useState<'male' | 'female' | null>(null);
  const [neutered, setNeutered] = useState(false);
  const [purebred, setPurebred] = useState(false);
  const [playStyles, setPlayStyles] = useState<PlayStyle[]>([]);
  const [goodWith, setGoodWith] = useState<GoodWith[]>([]);
  const [notGoodWith, setNotGoodWith] = useState<NotGoodWith[]>([]);
  const [vaccinated, setVaccinated] = useState<'yes' | 'no' | 'prefer_not'>('yes');
  const [vetChecked, setVetChecked] = useState(false);
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const progressAnim = useRef(new Animated.Value(0)).current;

  function animateProgress(toStep: number) {
    Animated.timing(progressAnim, {
      toValue: toStep / (STEPS.length - 1),
      duration: 300,
      useNativeDriver: false,
    }).start();
  }

  function nextStep() {
    if (step === 0 && !name.trim()) {
      Alert.alert("One thing first 🐾", "What's your dog's name?");
      return;
    }
    if (step === 0 && !size) {
      Alert.alert('Quick pick!', "What size is your dog?");
      return;
    }
    const next = (step + 1) as Step;
    setStep(next);
    animateProgress(next);
  }

  function prevStep() {
    const prev = (step - 1) as Step;
    setStep(prev);
    animateProgress(prev);
  }

  async function pickPhoto() {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [4, 5],
      quality: 0.8,
    });
    if (!result.canceled) setPhotoUri(result.assets[0].uri);
  }

  async function finish() {
    if (!photoUri) {
      Alert.alert('Almost there!', 'Add a photo of your dog so others can see them 📸');
      return;
    }
    setSaving(true);
    try {
      const { db } = getFirebase();
      const dogId = `dog_${Date.now()}`;
      const profile: Partial<DogProfile> = {
        name: name.trim(),
        breed,
        size: size!,
        age: age ?? 'adult',
        energy,
        sex: sex ?? 'male',
        neutered,
        purebred,
        playStyle: playStyles,
        goodWith,
        notGoodWith,
        vaccinated,
        vetChecked,
        photos: [],      // photo upload handled separately
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      await setDoc(doc(db, 'dogs', dogId), {
        ...profile,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      await AsyncStorage.setItem('userDogId', dogId);
      router.replace('/(tabs)/discover');
    } catch (e) {
      Alert.alert('Error', 'Could not save your profile. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  function togglePlayStyle(ps: PlayStyle) {
    setPlayStyles((prev) =>
      prev.includes(ps) ? prev.filter((x) => x !== ps) : [...prev, ps],
    );
  }
  function toggleGoodWith(g: GoodWith) {
    setGoodWith((prev) =>
      prev.includes(g) ? prev.filter((x) => x !== g) : [...prev, g],
    );
  }
  function toggleNotGoodWith(n: NotGoodWith) {
    setNotGoodWith((prev) =>
      prev.includes(n) ? prev.filter((x) => x !== n) : [...prev, n],
    );
  }

  const progressWidth = progressAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  return (
    <LinearGradient colors={['#FDF6EE', '#F5E6D3']} style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.logo}>🐾 GoDoggyDate</Text>
        <View style={styles.progressBar}>
          <Animated.View style={[styles.progressFill, { width: progressWidth }]} />
        </View>
        <View style={styles.stepLabels}>
          {STEPS.map((label, i) => (
            <Text
              key={label}
              style={[styles.stepLabel, i === step && styles.stepLabelActive]}
            >
              {label}
            </Text>
          ))}
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {step === 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Tell us about your dog 🐕</Text>

            {/* Photo */}
            <TouchableOpacity style={styles.photoPickerBtn} onPress={pickPhoto}>
              {photoUri ? (
                <Text style={styles.photoPickedText}>✅ Photo added!</Text>
              ) : (
                <>
                  <Text style={styles.photoIcon}>📸</Text>
                  <Text style={styles.photoLabel}>Add your dog's photo*</Text>
                  <Text style={styles.photoSub}>Required to appear in the feed</Text>
                </>
              )}
            </TouchableOpacity>

            <Text style={styles.fieldLabel}>Dog's Name *</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. Mochi"
              placeholderTextColor={colors.brownLight}
              value={name}
              onChangeText={setName}
            />

            <Text style={styles.fieldLabel}>Breed</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. Shiba Inu"
              placeholderTextColor={colors.brownLight}
              value={breed}
              onChangeText={setBreed}
            />

            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <Text style={styles.fieldLabel}>Purebred</Text>
                <Switch
                  value={purebred}
                  onValueChange={setPurebred}
                  trackColor={{ false: colors.border, true: colors.primary }}
                  thumbColor={colors.white}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.fieldLabel}>Spayed/Neutered</Text>
                <Switch
                  value={neutered}
                  onValueChange={setNeutered}
                  trackColor={{ false: colors.border, true: colors.primary }}
                  thumbColor={colors.white}
                />
              </View>
            </View>

            <Text style={styles.fieldLabel}>Size *</Text>
            <View style={styles.chipRow}>
              {SIZE_OPTIONS.map((o) => (
                <Pressable
                  key={o.value}
                  style={[styles.chip, size === o.value && styles.chipActive]}
                  onPress={() => setSize(o.value)}
                >
                  <Text style={styles.chipEmoji}>{o.emoji}</Text>
                  <Text style={[styles.chipText, size === o.value && styles.chipTextActive]}>
                    {o.label}
                  </Text>
                </Pressable>
              ))}
            </View>

            <Text style={styles.fieldLabel}>Age</Text>
            <View style={styles.chipRow}>
              {AGE_OPTIONS.map((o) => (
                <Pressable
                  key={o.value}
                  style={[styles.chip, age === o.value && styles.chipActive]}
                  onPress={() => setAge(o.value)}
                >
                  <Text style={styles.chipEmoji}>{o.emoji}</Text>
                  <Text style={[styles.chipText, age === o.value && styles.chipTextActive]}>
                    {o.label}
                  </Text>
                </Pressable>
              ))}
            </View>

            <Text style={styles.fieldLabel}>Sex</Text>
            <View style={styles.chipRow}>
              <Pressable
                style={[styles.chip, sex === 'male' && styles.chipActive]}
                onPress={() => setSex('male')}
              >
                <Text style={[styles.chipText, sex === 'male' && styles.chipTextActive]}>♂ Male</Text>
              </Pressable>
              <Pressable
                style={[styles.chip, sex === 'female' && styles.chipActive]}
                onPress={() => setSex('female')}
              >
                <Text style={[styles.chipText, sex === 'female' && styles.chipTextActive]}>♀ Female</Text>
              </Pressable>
            </View>
          </View>
        )}

        {step === 1 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Personality & Play Style 🎾</Text>

            <Text style={styles.fieldLabel}>Energy Level: {energy}%</Text>
            <View style={styles.sliderRow}>
              <Text style={styles.sliderEmoji}>🧘</Text>
              <View style={styles.sliderTrack}>
                {[0, 25, 50, 75, 100].map((v) => (
                  <Pressable
                    key={v}
                    onPress={() => setEnergy(v)}
                    style={[styles.sliderDot, energy >= v && styles.sliderDotFilled]}
                  />
                ))}
              </View>
              <Text style={styles.sliderEmoji}>⚡</Text>
            </View>
            <Text style={styles.sliderHint}>Tap to set energy level</Text>

            <Text style={styles.fieldLabel}>Play Style (pick all that apply)</Text>
            <View style={styles.chipRow}>
              {PLAY_STYLE_OPTIONS.map((o) => (
                <Pressable
                  key={o.value}
                  style={[styles.chip, playStyles.includes(o.value) && styles.chipActive]}
                  onPress={() => togglePlayStyle(o.value)}
                >
                  <Text style={styles.chipEmoji}>{o.emoji}</Text>
                  <Text
                    style={[styles.chipText, playStyles.includes(o.value) && styles.chipTextActive]}
                  >
                    {o.label}
                  </Text>
                </Pressable>
              ))}
            </View>

            <Text style={styles.fieldLabel}>✅ Good with</Text>
            <View style={styles.chipRow}>
              {GOOD_WITH_OPTIONS.map((o) => (
                <Pressable
                  key={o.value}
                  style={[styles.chip, goodWith.includes(o.value) && styles.chipActive]}
                  onPress={() => toggleGoodWith(o.value)}
                >
                  <Text
                    style={[styles.chipText, goodWith.includes(o.value) && styles.chipTextActive]}
                  >
                    {o.label}
                  </Text>
                </Pressable>
              ))}
            </View>

            <Text style={styles.fieldLabel}>⚠️ Not great with</Text>
            <View style={styles.chipRow}>
              {NOT_GOOD_WITH_OPTIONS.map((o) => (
                <Pressable
                  key={o.value}
                  style={[styles.chip, notGoodWith.includes(o.value) && styles.chipWarning]}
                  onPress={() => toggleNotGoodWith(o.value)}
                >
                  <Text
                    style={[
                      styles.chipText,
                      notGoodWith.includes(o.value) && styles.chipTextActive,
                    ]}
                  >
                    {o.label}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        )}

        {step === 2 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Health & Safety 🏥</Text>
            <Text style={styles.fieldSub}>
              All health info is self-reported. We never make medical claims.
            </Text>

            <Text style={styles.fieldLabel}>Vaccinated?</Text>
            <View style={styles.chipRow}>
              {(['yes', 'no', 'prefer_not'] as const).map((v) => (
                <Pressable
                  key={v}
                  style={[styles.chip, vaccinated === v && styles.chipActive]}
                  onPress={() => setVaccinated(v)}
                >
                  <Text style={[styles.chipText, vaccinated === v && styles.chipTextActive]}>
                    {v === 'yes' ? '✅ Yes' : v === 'no' ? '❌ No' : '🔒 Prefer not to say'}
                  </Text>
                </Pressable>
              ))}
            </View>

            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <Text style={styles.fieldLabel}>Vet checked</Text>
                <Switch
                  value={vetChecked}
                  onValueChange={setVetChecked}
                  trackColor={{ false: colors.border, true: colors.success }}
                  thumbColor={colors.white}
                />
              </View>
            </View>

            <View style={styles.trustBox}>
              <Text style={styles.trustTitle}>🛡️ Safety-First Platform</Text>
              <Text style={styles.trustText}>
                GoDoggyDate uses your dog's profile to prevent incompatible pairings before you
                ever swipe. Safety badges are displayed to all matches.
              </Text>
            </View>
          </View>
        )}
      </ScrollView>

      {/* Footer Buttons */}
      <View style={styles.footer}>
        {step > 0 && (
          <TouchableOpacity style={styles.backBtn} onPress={prevStep}>
            <Text style={styles.backBtnText}>← Back</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          style={[styles.nextBtn, saving && styles.nextBtnDisabled]}
          onPress={step < 2 ? nextStep : finish}
          disabled={saving}
        >
          <Text style={styles.nextBtnText}>
            {saving ? 'Saving...' : step < 2 ? 'Continue →' : '🐾 Find Playdates!'}
          </Text>
        </TouchableOpacity>
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    paddingTop: 60,
    paddingHorizontal: 24,
    paddingBottom: 12,
  },
  logo: {
    fontFamily: fonts.display,
    fontSize: 20,
    color: colors.brown,
    marginBottom: 16,
  },
  progressBar: {
    height: 6,
    backgroundColor: colors.border,
    borderRadius: radius.full,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: colors.primary,
    borderRadius: radius.full,
  },
  stepLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  stepLabel: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.brownLight,
  },
  stepLabelActive: {
    fontFamily: fonts.bold,
    color: colors.primary,
  },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 24, paddingBottom: 32 },
  section: { paddingTop: 16 },
  sectionTitle: {
    fontFamily: fonts.display,
    fontSize: 26,
    color: colors.brown,
    marginBottom: 20,
    lineHeight: 32,
  },
  fieldLabel: {
    fontFamily: fonts.semibold,
    fontSize: 14,
    color: colors.brownMid,
    marginTop: 16,
    marginBottom: 8,
  },
  fieldSub: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.brownLight,
    marginBottom: 16,
    lineHeight: 18,
  },
  input: {
    backgroundColor: colors.white,
    borderRadius: radius.md,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontFamily: fonts.body,
    fontSize: 16,
    color: colors.brown,
    borderWidth: 1,
    borderColor: colors.border,
  },
  row: {
    flexDirection: 'row',
    gap: 16,
    marginTop: 8,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.white,
    borderRadius: radius.full,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderWidth: 1.5,
    borderColor: colors.border,
    gap: 4,
  },
  chipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  chipWarning: {
    backgroundColor: colors.warning,
    borderColor: colors.warning,
  },
  chipEmoji: { fontSize: 14 },
  chipText: {
    fontFamily: fonts.semibold,
    fontSize: 13,
    color: colors.brownMid,
  },
  chipTextActive: { color: colors.white },
  sliderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginVertical: 8,
  },
  sliderEmoji: { fontSize: 22 },
  sliderTrack: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    height: 4,
    backgroundColor: colors.border,
    borderRadius: 2,
    paddingHorizontal: 2,
  },
  sliderDot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.border,
    borderWidth: 2,
    borderColor: colors.white,
  },
  sliderDotFilled: {
    backgroundColor: colors.primary,
  },
  sliderHint: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.brownLight,
    marginTop: 4,
  },
  photoPickerBtn: {
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    borderWidth: 2,
    borderColor: colors.border,
    borderStyle: 'dashed',
    padding: 32,
    alignItems: 'center',
    marginBottom: 8,
  },
  photoIcon: { fontSize: 40, marginBottom: 8 },
  photoLabel: {
    fontFamily: fonts.semibold,
    fontSize: 15,
    color: colors.brownMid,
  },
  photoSub: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.brownLight,
    marginTop: 4,
  },
  photoPickedText: {
    fontFamily: fonts.bold,
    fontSize: 16,
    color: colors.success,
  },
  trustBox: {
    backgroundColor: 'rgba(232,99,58,0.08)',
    borderRadius: radius.lg,
    padding: 16,
    marginTop: 20,
    borderLeftWidth: 3,
    borderLeftColor: colors.primary,
  },
  trustTitle: {
    fontFamily: fonts.bold,
    fontSize: 14,
    color: colors.primary,
    marginBottom: 6,
  },
  trustText: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.brownMid,
    lineHeight: 18,
  },
  footer: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 24,
    paddingBottom: 36,
    paddingTop: 12,
  },
  backBtn: {
    backgroundColor: colors.white,
    borderRadius: radius.full,
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  backBtnText: {
    fontFamily: fonts.semibold,
    fontSize: 15,
    color: colors.brownMid,
  },
  nextBtn: {
    flex: 1,
    backgroundColor: colors.primary,
    borderRadius: radius.full,
    paddingVertical: 16,
    alignItems: 'center',
    ...shadow.button,
  },
  nextBtnDisabled: { opacity: 0.6 },
  nextBtnText: {
    fontFamily: fonts.bold,
    fontSize: 16,
    color: colors.white,
  },
});
