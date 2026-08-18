'use client';
// web/components/DogProfileForm.tsx
// Dog profile form — device photo upload, breed datalist, structured location.

import { useEffect, useRef, useState } from 'react';
import type { SavedDogProfile } from '../lib/auth';
import { isProfileComplete } from '../lib/auth';
import { getVaccinationStatus, parseLocalIsoDate } from '../../shared/profile';
import { uploadDogPhoto } from '../lib/storage';
import { getFirebase } from '../shared/utils/firebase';
import { BREEDS } from '../../shared/types/breeds';

const SIZES: { value: 'S' | 'M' | 'L' | 'XL'; label: string }[] = [
  { value: 'S', label: 'Small' },
  { value: 'M', label: 'Medium' },
  { value: 'L', label: 'Large' },
  { value: 'XL', label: 'XL' },
];

const AGE_OPTIONS: { value: 'puppy' | 'adult' | 'senior'; label: string; sub: string }[] = [
  { value: 'puppy', label: 'Puppy', sub: '< 1 yr' },
  { value: 'adult', label: 'Adult', sub: '1–7 yrs' },
  { value: 'senior', label: 'Senior', sub: '7+ yrs' },
];

const TEMPERAMENT_OPTIONS = [
  'Friendly 😊', 'Playful 🎮', 'Gentle 🕊️', 'Energetic ⚡',
  'Calm 🧘', 'Independent 🦅', 'Social butterfly 🦋', 'Shy at first 🙈',
];

const PLAY_STYLE_OPTIONS = [
  'loves fetch 🎾', 'wrestling 🤼', 'gentle play 🐾',
  'high-energy runner ⚡', 'calm 🧘', 'explorer 👃',
];

// Safety screening. These two lists are the ONLY inputs
// detectUnsafePairings() reads (shared/utils/matchingEngine.ts) — nothing
// collected them before, so the engine could never produce a single warning
// while the homepage advertised that it prevented incompatible pairings.
// Values must match the NotGoodWith / BehaviorFlag unions in shared/types.
const NOT_GOOD_WITH_OPTIONS = [
  'small dogs', 'large dogs', 'puppies',
  'high-energy dogs', 'rough play', 'off-leash dogs',
];

const BEHAVIOR_FLAG_OPTIONS = [
  'needs slow introduction', 'easily overstimulated', 'resource guarding',
  'anxious with dogs', 'prefers calm dogs', 'not comfortable with kids',
  'reactive on leash only',
];

const DEFAULT_PROMPTS = [
  "My dog's personality in 3 words:",
  'Perfect playdate looks like:',
  'Things my dog loves:',
];

const MAX_PHOTOS = 6;
const MIN_PHOTOS = 3;

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const US_STATES: { abbr: string; name: string }[] = [
  { abbr: 'AL', name: 'Alabama' }, { abbr: 'AK', name: 'Alaska' },
  { abbr: 'AZ', name: 'Arizona' }, { abbr: 'AR', name: 'Arkansas' },
  { abbr: 'CA', name: 'California' }, { abbr: 'CO', name: 'Colorado' },
  { abbr: 'CT', name: 'Connecticut' }, { abbr: 'DC', name: 'D.C.' },
  { abbr: 'DE', name: 'Delaware' }, { abbr: 'FL', name: 'Florida' },
  { abbr: 'GA', name: 'Georgia' }, { abbr: 'HI', name: 'Hawaii' },
  { abbr: 'ID', name: 'Idaho' }, { abbr: 'IL', name: 'Illinois' },
  { abbr: 'IN', name: 'Indiana' }, { abbr: 'IA', name: 'Iowa' },
  { abbr: 'KS', name: 'Kansas' }, { abbr: 'KY', name: 'Kentucky' },
  { abbr: 'LA', name: 'Louisiana' }, { abbr: 'ME', name: 'Maine' },
  { abbr: 'MD', name: 'Maryland' }, { abbr: 'MA', name: 'Massachusetts' },
  { abbr: 'MI', name: 'Michigan' }, { abbr: 'MN', name: 'Minnesota' },
  { abbr: 'MS', name: 'Mississippi' }, { abbr: 'MO', name: 'Missouri' },
  { abbr: 'MT', name: 'Montana' }, { abbr: 'NE', name: 'Nebraska' },
  { abbr: 'NV', name: 'Nevada' }, { abbr: 'NH', name: 'New Hampshire' },
  { abbr: 'NJ', name: 'New Jersey' }, { abbr: 'NM', name: 'New Mexico' },
  { abbr: 'NY', name: 'New York' }, { abbr: 'NC', name: 'North Carolina' },
  { abbr: 'ND', name: 'North Dakota' }, { abbr: 'OH', name: 'Ohio' },
  { abbr: 'OK', name: 'Oklahoma' }, { abbr: 'OR', name: 'Oregon' },
  { abbr: 'PA', name: 'Pennsylvania' }, { abbr: 'RI', name: 'Rhode Island' },
  { abbr: 'SC', name: 'South Carolina' }, { abbr: 'SD', name: 'South Dakota' },
  { abbr: 'TN', name: 'Tennessee' }, { abbr: 'TX', name: 'Texas' },
  { abbr: 'UT', name: 'Utah' }, { abbr: 'VT', name: 'Vermont' },
  { abbr: 'VA', name: 'Virginia' }, { abbr: 'WA', name: 'Washington' },
  { abbr: 'WV', name: 'West Virginia' }, { abbr: 'WI', name: 'Wisconsin' },
  { abbr: 'WY', name: 'Wyoming' },
];

interface Props {
  onSaved: (profile: SavedDogProfile) => void;
  saving: boolean;
  initialProfile?: SavedDogProfile | null;
  /** When set, the form scrolls to and focuses that section on open (e.g. the
   *  "Add birth date" nudge deep-links straight to the birthday inputs). */
  focusSection?: 'birthday';
}

interface PhotoItem {
  id: string;
  url: string;
  file?: File;
  preview?: string;
}

interface ValidationErrors {
  photos: string;
  name: string;
  breed: string;
  age: string;
  sex: string;
  size: string;
  energy: string;
  zip: string;
  city: string;
  state: string;
  personality: string;
  rabiesExpiry: string;
}

function countComplete(p: {
  photos: number;
  name: string;
  breed: string;
  age: string | undefined;
  sex: string | undefined;
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
  if (p.energyLevel !== undefined) n++;
  if (p.temperament.length >= 1 || p.playStyles.length >= 1) n++;
  if (p.city.trim()) n++;
  return n;
}

const EMPTY_ERRORS: ValidationErrors = {
  photos: '',
  name: '',
  breed: '',
  age: '',
  sex: '',
  size: '',
  energy: '',
  zip: '',
  city: '',
  state: '',
  personality: '',
  rabiesExpiry: '',
};

export default function DogProfileForm({ onSaved, saving, initialProfile, focusSection }: Props) {
  const [name, setName] = useState('');
  const [breed, setBreed] = useState('');
  const [age, setAge] = useState<'puppy' | 'adult' | 'senior' | ''>('');
  const [sex, setSex] = useState<'M' | 'F' | ''>('');
  const [size, setSize] = useState<'S' | 'M' | 'L' | 'XL'>('M');
  const [energyLevel, setEnergyLevel] = useState(60);
  const [temperament, setTemperament] = useState<string[]>([]);
  const [playStyles, setPlayStyles] = useState<string[]>([]);
  const [notGoodWith, setNotGoodWith] = useState<string[]>([]);
  const [behaviorFlags, setBehaviorFlags] = useState<string[]>([]);
  const [zip, setZip] = useState('');
  const [city, setCity] = useState('');
  const [usState, setUsState] = useState('');
  // null, not true. This started as useState(true), which meant every profile
  // ever saved carried a vaccination "yes" the owner was never asked for — and
  // that default was rendered as a green ✓ pill and published on the public
  // page. null is genuinely unanswered and stays distinguishable from an
  // explicit "no" (the only value the matching engine blocks on).
  const [vaccinated, setVaccinated] = useState<boolean | null>(null);
  const [rabiesExpiry, setRabiesExpiry] = useState('');
  // Birthday & milestones (all optional). Kept as strings for the inputs and
  // parsed on save. birthYear powers the life-stage read; birthMonth the
  // birthday-MONTH celebration; adoptionDate ('YYYY-MM-DD') Gotcha Day.
  const [birthYear, setBirthYear] = useState('');
  const [birthMonth, setBirthMonth] = useState('');
  const [adoptionDate, setAdoptionDate] = useState('');
  const [prompts, setPrompts] = useState(
    DEFAULT_PROMPTS.map((prompt) => ({ prompt, answer: '' })),
  );
  const [photos, setPhotos] = useState<PhotoItem[]>([]);
  const [submitted, setSubmitted] = useState(false);
  const [errors, setErrors] = useState<ValidationErrors>(EMPTY_ERRORS);
  const [uploading, setUploading] = useState(false);

  // Vibe Check — photos in, a finished profile out. Additive to the manual
  // form rather than replacing it: on success it pre-fills the fields below
  // (still fully editable — "the app wrote it, you edit it," never silently
  // auto-saved), and the generated bio/archetype persist server-side to
  // dogs/{uid}.ai regardless of whether this specific form submission saves.
  const [vibeChecking, setVibeChecking] = useState(false);
  const [vibeCheckError, setVibeCheckError] = useState<string | null>(null);
  const [vibeCheckResult, setVibeCheckResult] = useState<{ bio: string; archetypeName: string; archetypeDescription: string } | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const previewUrlsRef = useRef<string[]>([]);
  const photosRef = useRef<HTMLDivElement | null>(null);
  const nameRef = useRef<HTMLInputElement | null>(null);
  const breedRef = useRef<HTMLInputElement | null>(null);
  const ageRef = useRef<HTMLDivElement | null>(null);
  const sexRef = useRef<HTMLDivElement | null>(null);
  const sizeRef = useRef<HTMLDivElement | null>(null);
  const energyRef = useRef<HTMLInputElement | null>(null);
  const birthYearRef = useRef<HTMLInputElement | null>(null);
  const zipRef = useRef<HTMLInputElement | null>(null);
  const locationRef = useRef<HTMLInputElement | null>(null);
  const stateRef = useRef<HTMLSelectElement | null>(null);
  const rabiesExpiryRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    return () => {
      previewUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    };
  }, []);

  // Deep-link: when opened via the "Add birth date" nudge, scroll to and focus
  // the birthday inputs instead of dumping the user at the top of the form.
  useEffect(() => {
    if (focusSection === 'birthday' && birthYearRef.current) {
      birthYearRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
      const t = window.setTimeout(() => birthYearRef.current?.focus(), 250);
      return () => window.clearTimeout(t);
    }
  }, [focusSection]);

  useEffect(() => {
    if (!initialProfile) return;

    setName(initialProfile.name ?? '');
    setBreed(initialProfile.breed ?? '');
    setAge(initialProfile.age ?? '');
    setSex(initialProfile.sex ?? '');
    setSize(initialProfile.size ?? 'M');
    setEnergyLevel(initialProfile.energyLevel ?? 60);
    setTemperament(initialProfile.temperament ?? []);
    setPlayStyles(initialProfile.playStyles ?? []);
    setNotGoodWith(initialProfile.notGoodWith ?? []);
    setBehaviorFlags(initialProfile.behaviorFlags ?? []);
    setVaccinated(initialProfile.vaccinated ?? null);
    setRabiesExpiry(initialProfile.rabiesExpiry ?? '');
    setBirthYear(typeof initialProfile.birthYear === 'number' ? String(initialProfile.birthYear) : '');
    setBirthMonth(typeof initialProfile.birthMonth === 'number' ? String(initialProfile.birthMonth) : '');
    setAdoptionDate(initialProfile.adoptionDate ?? '');
    setPrompts(
      DEFAULT_PROMPTS.map((prompt) => {
        const existing = initialProfile.prompts?.find((item) => item.prompt === prompt);
        return { prompt, answer: existing?.answer ?? '' };
      }),
    );
    setSubmitted(false);
    setErrors(EMPTY_ERRORS);

    setZip(initialProfile.zip ?? '');
    const locStr = initialProfile.location ?? '';
    const savedCity = initialProfile.city ?? '';
    const savedState = initialProfile.state ?? '';
    if (savedCity || savedState) {
      setCity(savedCity);
      setUsState(savedState);
    } else {
      const lastComma = locStr.lastIndexOf(',');
      if (lastComma !== -1) {
        const possibleState = locStr.slice(lastComma + 1).trim();
        if (US_STATES.some((state) => state.abbr === possibleState)) {
          setCity(locStr.slice(0, lastComma).trim());
          setUsState(possibleState);
        } else {
          setCity(locStr);
          setUsState('');
        }
      } else {
        setCity(locStr);
        setUsState('');
      }
    }

    previewUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    previewUrlsRef.current = [];

    const realUrls = (initialProfile.photos ?? []).filter((photo) => photo && !photo.startsWith('_'));
    setPhotos(realUrls.map((url, index) => ({
      id: `existing-${index}-${url}`,
      url,
    })));
  }, [initialProfile]);

  function toggleTag(tag: string, list: string[], setList: (v: string[]) => void) {
    setList(list.includes(tag) ? list.filter((x) => x !== tag) : [...list, tag]);
  }

  function setPromptAnswer(i: number, answer: string) {
    setPrompts((prev) => prev.map((prompt, idx) => (idx === i ? { ...prompt, answer } : prompt)));
  }

  function handlePhotoFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []).slice(0, MAX_PHOTOS - photos.length);
    if (files.length === 0) return;

    const nextPhotos = files.map((file, index) => {
      const preview = URL.createObjectURL(file);
      previewUrlsRef.current.push(preview);
      return {
        id: `new-${Date.now()}-${index}`,
        url: '',
        file,
        preview,
      };
    });

    setPhotos((prev) => [...prev, ...nextPhotos]);
    if (submitted) {
      setErrors((prev) => ({ ...prev, photos: '' }));
    }
    e.target.value = '';
  }

  function removePhoto(photoId: string) {
    setPhotos((prev) => {
      const photo = prev.find((item) => item.id === photoId);
      if (photo?.preview) {
        URL.revokeObjectURL(photo.preview);
        previewUrlsRef.current = previewUrlsRef.current.filter((url) => url !== photo.preview);
      }
      return prev.filter((item) => item.id !== photoId);
    });
  }

  function fileToDataUri(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(reader.error ?? new Error('Could not read file'));
      reader.readAsDataURL(file);
    });
  }

  async function handleVibeCheck() {
    if (vibeChecking) return;
    // Newly-picked photos carry a raw File and can be sent inline as base64.
    // Already-uploaded photos (edit mode / any returning user) are Storage
    // URLs with no File — those go through useStoredPhotos, where the SERVER
    // reads the caller's own dog doc and fetches them. This branch used to
    // bail out entirely, which meant every existing dog — including the
    // founder's — could never generate a Vibe Check at all, and every
    // archetype/bio surface in the app rendered blank for them.
    const candidates = photos.filter((p) => p.file).slice(0, 3);
    const useStoredPhotos = candidates.length === 0;

    if (useStoredPhotos && photos.length === 0) {
      setVibeCheckError('Add at least one photo first');
      return;
    }

    setVibeChecking(true);
    setVibeCheckError(null);
    try {
      const { auth } = getFirebase();
      const currentUser = auth.currentUser;
      if (!currentUser) throw new Error('Not signed in');
      const idToken = await currentUser.getIdToken();

      const body: Record<string, unknown> = { name: name.trim() || undefined };
      if (useStoredPhotos) {
        body.useStoredPhotos = true;
      } else {
        const dataUris = await Promise.all(candidates.map((p) => fileToDataUri(p.file as File)));
        body.photos = dataUris.map((dataUri) => ({ dataUri }));
      }

      const res = await fetch('/api/ai/vibe-check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ai?.vibeCheck) {
        throw new Error(data?.error || 'Vibe Check failed');
      }

      const vc = data.ai.vibeCheck;
      // Pre-fill, don't auto-save — the user still reviews/edits/submits
      // through the normal form flow below.
      if (vc.breedGuess?.name) setBreed(vc.breedGuess.name);
      if (typeof vc.sizeEstimate === 'string') setSize(vc.sizeEstimate);
      if (typeof vc.energyEstimate === 'number') setEnergyLevel(vc.energyEstimate);
      if (Array.isArray(vc.playStyleGuesses) && vc.playStyleGuesses.length > 0) setPlayStyles(vc.playStyleGuesses);
      if (Array.isArray(vc.temperamentGuesses) && vc.temperamentGuesses.length > 0) setTemperament(vc.temperamentGuesses);
      setVibeCheckResult({
        bio: vc.bio,
        archetypeName: vc.archetype?.name ?? '',
        archetypeDescription: vc.archetype?.description ?? '',
      });
    } catch (err) {
      setVibeCheckError(err instanceof Error ? err.message : 'Vibe Check failed — try again');
    } finally {
      setVibeChecking(false);
    }
  }

  function getValidationErrors(): ValidationErrors {
    const hasZip = !!zip.trim();
    const hasCity = !!city.trim();
    const hasState = !!usState.trim();

    return {
      photos: photos.length < 3 ? 'Add at least 3 photos' : '',
      name: !name.trim() ? 'Required' : '',
      breed: !breed.trim() ? 'Required' : '',
      age: !age ? 'Required' : '',
      sex: !sex ? 'Required' : '',
      size: !size ? 'Required' : '',
      energy: Number.isFinite(energyLevel) ? '' : 'Required',
      zip: hasZip && !/^\d{5}(-\d{4})?$/.test(zip.trim()) ? "That ZIP doesn't smell right" : '',
      city: !hasZip && !hasCity ? 'Enter a city or use ZIP' : '',
      state: !hasZip && hasCity && !hasState ? 'Select a state' : '',
      personality: temperament.length === 0 && playStyles.length === 0 ? 'Pick at least one' : '',
      // Optional field — only a value that isn't a real calendar date is an
      // error. An expiry in the past is valid input and must stay savable:
      // "expired" is the state this field exists to surface.
      rabiesExpiry: rabiesExpiry.trim() && !parseLocalIsoDate(rabiesExpiry)
        ? 'Use the date on the certificate (YYYY-MM-DD)'
        : '',
    };
  }

  function focusFirstInvalid(nextErrors: ValidationErrors) {
    const order: Array<keyof ValidationErrors> = [
      'photos',
      'name',
      'breed',
      'age',
      'sex',
      'size',
      'energy',
      'zip',
      'city',
      'state',
      'personality',
      'rabiesExpiry',
    ];

    const firstInvalid = order.find((field) => nextErrors[field]);
    if (!firstInvalid) return;

    const targets: Record<keyof ValidationErrors, HTMLElement | null> = {
      photos: photosRef.current,
      name: nameRef.current,
      breed: breedRef.current,
      age: ageRef.current,
      sex: sexRef.current,
      size: sizeRef.current,
      energy: energyRef.current,
      zip: zipRef.current,
      city: locationRef.current,
      state: stateRef.current,
      personality: null,
      rabiesExpiry: rabiesExpiryRef.current,
    };

    const target = targets[firstInvalid];
    if (!target) return;
    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    window.setTimeout(() => target.focus?.(), 120);
  }

  const completedCount = countComplete({
    photos: photos.length,
    name,
    breed,
    age: age || undefined,
    sex: sex || undefined,
    size,
    energyLevel,
    temperament,
    playStyles,
    city: zip.trim() || city,
  });
  const progressPct = Math.round((completedCount / 9) * 100);

  // Same helper every rendering surface uses, so the preview below the form
  // cannot drift from what the swipe card actually says.
  const vaccinationPreview = getVaccinationStatus({ rabiesExpiry, vaccinated });

  const zipStr = zip.trim();
  const cityStr = city.trim();
  const stateStr = usState.trim();
  const locationStr = zipStr
    ? zipStr
    : cityStr && stateStr
    ? `${cityStr}, ${stateStr}`
    : '';

  // isProfileComplete only checks photos.length >= 3 — it never reads the
  // values. This used to build photosForCheck from already-uploaded Storage
  // URLs only, so a brand-new user who just picked 3 photos (still local
  // Files, url === '' until submit) saw uploadedUrls.length === 0 and got
  // told their profile was incomplete at the exact moment it wasn't — an
  // orange progress bar, "Save Profile" instead of "Save & Start Swiping",
  // and a "To unlock swiping, add:" heading over an empty list, since every
  // other requirement was in fact met. Count every selected photo, local or
  // uploaded — the local ones upload for real on submit either way.
  const photosForCheck = Array(photos.length).fill('_placeholder_');

  const complete = isProfileComplete({
    name: name.trim(),
    breed: breed.trim(),
    age: age || undefined,
    sex: sex || undefined,
    size,
    energyLevel,
    temperament,
    playStyles,
    photos: photosForCheck,
    location: locationStr,
    city: cityStr || undefined,
    state: stateStr || undefined,
    zip: zipStr || undefined,
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitted(true);

    const nextErrors = getValidationErrors();
    setErrors(nextErrors);
    if (Object.values(nextErrors).some(Boolean)) {
      focusFirstInvalid(nextErrors);
      return;
    }

    setUploading(true);
    try {
      const uid = getFirebase().auth.currentUser?.uid;
      const finalUrls = await Promise.all(
        photos.map(async (photo) => {
          if (photo.url) return photo.url;
          if (!uid || !photo.file) return '';
          const uploadedUrl = await uploadDogPhoto(uid, photo.file);
          return uploadedUrl;
        }),
      );

      const realUrls = finalUrls.filter(Boolean);
      const photosFinal = [
        ...realUrls,
        ...Array(Math.max(0, MIN_PHOTOS - realUrls.length)).fill('_placeholder_'),
      ];

      onSaved({
        name: name.trim(),
        breed: breed.trim(),
        age: age || undefined,
        sex: sex || undefined,
        size,
        energyLevel,
        temperament,
        playStyles,
        notGoodWith,
        behaviorFlags,
        photos: photosFinal,
        location: locationStr,
        city: cityStr || undefined,
        state: stateStr || undefined,
        zip: zipStr || undefined,
        vaccinated,
        // null rather than undefined when empty: saves are { merge: true } and
        // stripUndefined drops undefined keys, so an omitted field would leave
        // a date the owner just deleted sitting in Firestore.
        //
        // TODO(reminders): once a rabies expiry is saved here, seed a Cadence
        // reminder from it — call createReminder(uid, { type: 'rabies', label:
        // 'Rabies booster', dueDate: <local-midnight ms of rabiesExpiry>,
        // recurrenceDays: 365 }) from web/lib/reminders.ts. Deliberately not
        // wired up in this change (reminders.ts is owned elsewhere), and it
        // needs two decisions first: don't create a duplicate when the owner
        // re-saves an unchanged date, and derive dueDate with
        // parseLocalIsoDate(...).getTime() so the reminder doesn't fire a day
        // early west of Greenwich.
        rabiesExpiry: rabiesExpiry.trim() || null,
        // Birthday & milestones — parsed and range-checked; invalid input is
        // simply not saved (the life-stage/milestone code also rejects garbage).
        // adoptionDate uses null-when-empty for the same { merge: true } reason
        // as rabiesExpiry above.
        birthYear: (() => {
          const y = Number(birthYear);
          return Number.isInteger(y) && y >= 1990 && y <= new Date().getFullYear() ? y : undefined;
        })(),
        birthMonth: (() => {
          const m = Number(birthMonth);
          return Number.isInteger(m) && m >= 1 && m <= 12 ? m : undefined;
        })(),
        adoptionDate: adoptionDate.trim() || null,
        prompts: prompts.filter((prompt) => prompt.answer.trim()),
      });
    } finally {
      setUploading(false);
    }
  }

  const isBusy = uploading || saving;

  return (
    <div className="flex min-h-[80vh] flex-col items-center justify-start px-6 py-8">
      <p className="mb-3 text-4xl">🐾</p>
      <h2 className="mb-1 font-display text-3xl text-brown">Set up your dog&apos;s profile</h2>
      <p className="mb-4 text-center text-sm text-brown-light">
        Helps us find the right matches for your pup.
      </p>

      <div className="mb-6 w-full max-w-sm">
        <div className="mb-1 flex justify-between text-xs text-brown-light">
          <span>{completedCount}/9 sections complete</span>
          <span className={complete ? 'font-semibold text-green-600' : 'font-semibold text-primary'}>
            {complete ? '✓ Ready to swipe!' : `${progressPct}% — complete to unlock swipe`}
          </span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-border">
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{
              width: `${progressPct}%`,
              backgroundColor: complete ? '#22c55e' : '#E8633A',
            }}
          />
        </div>
      </div>

      <form onSubmit={handleSubmit} className="flex w-full max-w-sm flex-col gap-5">
        <div ref={photosRef} tabIndex={-1}>
          <label className="mb-1.5 block text-sm font-semibold text-brown-mid">
            Photos <span className="font-normal text-brown-light">({MIN_PHOTOS} required, up to {MAX_PHOTOS})</span>
          </label>
          {photos.length > 0 && (
            <div className="grid grid-cols-3 gap-2">
              {photos.map((photo, index) => (
                <div key={photo.id} className="relative aspect-square overflow-hidden rounded-2xl border border-border bg-cream-dark">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={photo.preview ?? photo.url}
                    alt={`Photo ${index + 1}`}
                    className="h-full w-full object-cover"
                  />
                  <button
                    type="button"
                    onClick={() => removePhoto(photo.id)}
                    className="absolute right-1 top-1 flex h-7 w-7 items-center justify-center rounded-full bg-black/55 text-sm text-white"
                    aria-label="Remove photo"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
          <div className="mt-3 flex items-center gap-3">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              onChange={handlePhotoFiles}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={photos.length >= MAX_PHOTOS || isBusy}
              className="rounded-xl border border-border bg-white px-4 py-2.5 text-sm font-semibold text-brown transition-colors hover:border-primary disabled:opacity-40"
            >
              {photos.length > 0 ? 'Add more photos' : 'Upload photos'}
            </button>
            <span className="text-xs text-brown-light">{photos.length}/{MAX_PHOTOS}</span>
          </div>
          <p className="mt-1.5 text-[11px] leading-relaxed text-brown-light">
            Choose images from your device. The first photo becomes the main card image.
          </p>
          {errors.photos && <p className="mt-1 text-xs text-red-500">{errors.photos}</p>}

          {/* Was gated on `photos.some(p => p.file)` — i.e. only ever offered
              when a photo was still in memory. Every returning user's photos
              are Storage URLs with no File, so the button simply never
              appeared for them and their dog could never get an archetype.
              Now offered whenever there is any photo at all; the handler
              picks the inline-base64 or server-fetch path. */}
          {photos.length > 0 && !vibeCheckResult && (
            <button
              type="button"
              onClick={handleVibeCheck}
              disabled={vibeChecking}
              className="mt-3 w-full rounded-xl border border-gold/50 bg-gold/10 px-4 py-2.5 text-sm font-bold text-brown transition-colors hover:bg-gold/20 disabled:opacity-50"
            >
              {vibeChecking
                ? 'Reading the photos…'
                : initialProfile?.ai?.vibeCheck
                  ? '✨ Redo the Vibe Check'
                  : '✨ Fill this in from the photos'}
            </button>
          )}
          {vibeCheckError && <p className="mt-1.5 text-xs text-red-500">{vibeCheckError}</p>}
          {vibeCheckResult && (
            <div className="mt-3 rounded-2xl border border-gold/40 bg-gold/10 px-4 py-3">
              <p className="text-xs font-bold uppercase tracking-[0.1em] text-brown/70">
                {vibeCheckResult.archetypeName}
              </p>
              <p className="mt-1 text-sm text-brown leading-relaxed">&ldquo;{vibeCheckResult.bio}&rdquo;</p>
              <p className="mt-2 text-xs text-brown-light leading-relaxed">
                {vibeCheckResult.archetypeDescription}
              </p>
              <p className="mt-2 text-[11px] text-brown-light">
                Filled in breed, size, energy, and tags below — check them over.
              </p>
            </div>
          )}
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-semibold text-brown-mid">Dog&apos;s name</label>
          <input
            ref={nameRef}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Kaju"
            className="w-full rounded-xl border border-border bg-white px-4 py-2.5 text-sm text-brown outline-none transition-colors focus:border-primary"
          />
          {errors.name && <p className="mt-1 text-xs text-red-500">{errors.name}</p>}
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-semibold text-brown-mid">Breed</label>
          <input
            ref={breedRef}
            list="breed-list"
            value={breed}
            onChange={(e) => setBreed(e.target.value)}
            placeholder="e.g. Golden Retriever, Dachshund Mix"
            className="w-full rounded-xl border border-border bg-white px-4 py-2.5 text-sm text-brown outline-none transition-colors focus:border-primary"
          />
          <datalist id="breed-list">
            {BREEDS.map((breedOption) => (
              <option key={breedOption.id} value={breedOption.name} />
            ))}
            <option value="Mixed Breed" />
            <option value="Unknown Mix" />
          </datalist>
          {errors.breed && <p className="mt-1 text-xs text-red-500">{errors.breed}</p>}
        </div>

        <div ref={ageRef} tabIndex={-1}>
          <label className="mb-1.5 block text-sm font-semibold text-brown-mid">Age</label>
          <div className="flex gap-2">
            {AGE_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setAge(option.value)}
                className={`chip flex flex-1 flex-col items-center gap-0 py-2 text-xs ${age === option.value ? 'chip-active' : ''}`}
              >
                <span className="font-semibold">{option.label}</span>
                <span className="font-normal opacity-70">{option.sub}</span>
              </button>
            ))}
          </div>
          {errors.age && <p className="mt-1 text-xs text-red-500">{errors.age}</p>}
        </div>

        <div ref={sexRef} tabIndex={-1}>
          <label className="mb-1.5 block text-sm font-semibold text-brown-mid">Sex</label>
          <div className="flex gap-3">
            {([
              { value: 'M', label: 'Male' },
              { value: 'F', label: 'Female' },
            ] as const).map((option) => (
              <label
                key={option.value}
                className={`flex-1 rounded-xl border-2 px-4 py-2.5 text-sm font-semibold transition-colors ${
                  sex === option.value
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border bg-white text-brown-mid'
                }`}
              >
                <input
                  type="radio"
                  name="dog-sex"
                  value={option.value}
                  checked={sex === option.value}
                  onChange={() => setSex(option.value)}
                  className="sr-only"
                />
                {option.label}
              </label>
            ))}
          </div>
          {errors.sex && <p className="mt-1 text-xs text-red-500">{errors.sex}</p>}
        </div>

        <div ref={sizeRef} tabIndex={-1}>
          <label className="mb-1.5 block text-sm font-semibold text-brown-mid">Size</label>
          <div className="flex gap-2">
            {SIZES.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setSize(option.value)}
                className={`chip flex-1 justify-center text-xs ${size === option.value ? 'chip-active' : ''}`}
              >
                {option.label}
              </button>
            ))}
          </div>
          {errors.size && <p className="mt-1 text-xs text-red-500">{errors.size}</p>}
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-semibold text-brown-mid">
            Energy level <span className="font-bold text-primary">{energyLevel}%</span>
          </label>
          <input
            ref={energyRef}
            type="range"
            min={10}
            max={100}
            step={5}
            value={energyLevel}
            onChange={(e) => setEnergyLevel(Number(e.target.value))}
            className="w-full accent-primary"
          />
          <div className="mt-1 flex justify-between text-xs text-brown-light">
            <span>Chill 🧘</span>
            <span>Energetic ⚡</span>
          </div>
          {errors.energy && <p className="mt-1 text-xs text-red-500">{errors.energy}</p>}
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-semibold text-brown-mid">
            Temperament <span className="font-normal text-brown-light">(pick any)</span>
          </label>
          <div className="flex flex-wrap gap-2">
            {TEMPERAMENT_OPTIONS.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => toggleTag(option, temperament, setTemperament)}
                className={`chip text-xs ${temperament.includes(option) ? 'chip-active' : ''}`}
              >
                {option}
              </button>
            ))}
          </div>
          {errors.personality && <p className="mt-1 text-xs text-red-500">{errors.personality}</p>}
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-semibold text-brown-mid">
            Play style <span className="font-normal text-brown-light">(pick any)</span>
          </label>
          <div className="flex flex-wrap gap-2">
            {PLAY_STYLE_OPTIONS.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => toggleTag(option, playStyles, setPlayStyles)}
                className={`chip text-xs ${playStyles.includes(option) ? 'chip-active' : ''}`}
              >
                {option}
              </button>
            ))}
          </div>
        </div>

        {/* Safety screening — the only inputs the matching engine's
            detectUnsafePairings() reads. Optional on purpose: most dogs have
            nothing to declare, and forcing a choice would push people to
            click something untrue. */}
        <div className="rounded-2xl border border-amber-200 bg-amber-50/50 p-4">
          <p className="text-sm font-bold text-brown">Safety</p>
          <p className="mt-0.5 text-[11px] leading-relaxed text-brown-light">
            Only what you tell us here can warn another owner before a meetup. Skip anything that
            doesn&apos;t apply.
          </p>

          <label className="mt-3 mb-1.5 block text-xs font-semibold text-brown-mid">
            Not a good match with
          </label>
          <div className="flex flex-wrap gap-2">
            {NOT_GOOD_WITH_OPTIONS.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => toggleTag(option, notGoodWith, setNotGoodWith)}
                className={`chip text-xs ${notGoodWith.includes(option) ? 'chip-active' : ''}`}
              >
                {option}
              </button>
            ))}
          </div>

          <label className="mt-4 mb-1.5 block text-xs font-semibold text-brown-mid">
            Good to know before meeting
          </label>
          <div className="flex flex-wrap gap-2">
            {BEHAVIOR_FLAG_OPTIONS.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => toggleTag(option, behaviorFlags, setBehaviorFlags)}
                className={`chip text-xs ${behaviorFlags.includes(option) ? 'chip-active' : ''}`}
              >
                {option}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-semibold text-brown-mid">Location</label>
          <div className="flex flex-col gap-2">
            <input
              ref={zipRef}
              value={zip}
              onChange={(e) => setZip(e.target.value)}
              inputMode="numeric"
              placeholder="ZIP code"
              className="w-full rounded-xl border border-border bg-white px-4 py-2.5 text-sm text-brown outline-none transition-colors focus:border-primary"
            />
            {errors.zip && <p className="-mt-1 text-xs text-red-500">{errors.zip}</p>}
            <div className="flex items-center gap-2 text-xs text-brown-light">
              <span className="h-px flex-1 bg-border" />
              <span>or</span>
              <span className="h-px flex-1 bg-border" />
            </div>
            <div className="flex gap-2">
              <input
              ref={locationRef}
              value={city}
              onChange={(e) => setCity(e.target.value)}
              placeholder="City or neighborhood"
              className="min-w-0 flex-1 rounded-xl border border-border bg-white px-4 py-2.5 text-sm text-brown outline-none transition-colors focus:border-primary"
            />
            <select
              ref={stateRef}
              value={usState}
              onChange={(e) => setUsState(e.target.value)}
              className="w-24 appearance-none rounded-xl border border-border bg-white px-2 py-2.5 text-center text-sm text-brown outline-none transition-colors focus:border-primary"
              aria-label="State"
            >
              <option value="">State</option>
              {US_STATES.map((state) => (
                <option key={state.abbr} value={state.abbr}>{state.abbr} — {state.name}</option>
              ))}
            </select>
            </div>
          </div>
          {errors.city && <p className="mt-1 text-xs text-red-500">{errors.city}</p>}
          {errors.state && <p className="mt-1 text-xs text-red-500">{errors.state}</p>}
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-semibold text-brown-mid">
            About your dog <span className="font-normal text-brown-light">(optional)</span>
          </label>
          <div className="flex flex-col gap-3">
            {prompts.map((prompt, i) => (
              <div key={prompt.prompt}>
                <p className="mb-1 text-xs text-brown-light">{prompt.prompt}</p>
                <input
                  value={prompt.answer}
                  onChange={(e) => setPromptAnswer(i, e.target.value)}
                  placeholder="Your answer…"
                  className="w-full rounded-xl border border-border bg-white px-4 py-2.5 text-sm text-brown outline-none transition-colors focus:border-primary"
                />
              </div>
            ))}
          </div>
        </div>

        {/* Vaccination. The date is the real artifact here: `vaccinated` was a
            boolean initialised to true, so it recorded a default rather than an
            answer — and that default was rendered as a green ✓ pill on the swipe
            card and published on the public /d page. A rabies expiry is read off
            an actual certificate, and it's the date owners hunt for at every
            boarding, daycare, grooming and lease check-in. Optional: with no
            date, everything downstream degrades to an attributed "owner
            marked …" or an honest blank — never a verification. */}
        <div className="rounded-2xl border border-border bg-white p-4">
          <p className="text-sm font-bold text-brown">Vaccination</p>
          <p className="mt-0.5 text-[11px] leading-relaxed text-brown-light">
            Nobody verifies any of this. Other owners see it attributed to you, exactly as you enter it.
          </p>

          <label htmlFor="rabies-expiry" className="mt-3 mb-1.5 block text-xs font-semibold text-brown-mid">
            Rabies expiry date <span className="font-normal text-brown-light">(optional)</span>
          </label>
          <input
            id="rabies-expiry"
            ref={rabiesExpiryRef}
            type="date"
            value={rabiesExpiry}
            onChange={(e) => setRabiesExpiry(e.target.value)}
            className="w-full rounded-xl border border-border bg-white px-4 py-2.5 text-sm text-brown outline-none transition-colors focus:border-primary"
          />
          <p className="mt-1.5 text-[11px] leading-relaxed text-brown-light">
            The date printed on the certificate — the one boarding, daycare, groomers and landlords all
            ask for. Keep it here and you&apos;ll stop digging through email for it.
          </p>
          {errors.rabiesExpiry && <p className="mt-1 text-xs text-red-500">{errors.rabiesExpiry}</p>}

          <label className="mt-4 mb-1.5 block text-xs font-semibold text-brown-mid">
            No certificate handy?
          </label>
          <div className="flex gap-3">
            {([true, false] as const).map((value) => (
              <button
                key={String(value)}
                type="button"
                // Tapping the selected answer clears it back to null. Without a
                // route back to "unanswered", a mis-tap would be permanent — and
                // "unanswered" is the whole point of this field now.
                onClick={() => setVaccinated(vaccinated === value ? null : value)}
                aria-pressed={vaccinated === value}
                className={`flex-1 rounded-xl border-2 py-2.5 text-sm font-semibold transition-colors ${
                  vaccinated === value
                    ? value
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-amber-400 bg-amber-50 text-amber-700'
                    : 'border-border bg-white text-brown-mid'
                }`}
              >
                {value ? 'Vaccinated' : 'Not currently'}
              </button>
            ))}
          </div>
          <p className="mt-1.5 text-[11px] leading-relaxed text-brown-light">
            Leave both off if you&apos;d rather not say — tap a selected answer to clear it.
          </p>

          {/* The exact string other owners will read, so there's no gap between
              what you entered and what the app claims on your behalf. */}
          <p className="mt-3 rounded-xl bg-cream-dark px-3 py-2 text-[11px] leading-relaxed text-brown-mid">
            Others will see:{' '}
            <span className="font-semibold text-brown">{vaccinationPreview.label}</span>
          </p>
        </div>

        {/* Birthday & milestones — all optional, none gate swiping. Powers the
            life-stage read and the birthday / Gotcha Day celebration cards. */}
        <div className="rounded-2xl border border-border bg-white p-4">
          <p className="text-sm font-bold text-brown">🎂 Birthday &amp; milestones</p>
          <p className="mt-0.5 text-[11px] leading-relaxed text-brown-light">
            Optional — unlocks {name.trim() || 'your dog'}&apos;s life stage plus birthday and Gotcha Day
            celebrations.
          </p>

          <div className="mt-3 grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="birth-year" className="mb-1.5 block text-xs font-semibold text-brown-mid">
                Birth year
              </label>
              <input
                id="birth-year"
                ref={birthYearRef}
                type="number"
                inputMode="numeric"
                min={1990}
                max={new Date().getFullYear()}
                placeholder="e.g. 2021"
                value={birthYear}
                onChange={(e) => setBirthYear(e.target.value)}
                className="w-full rounded-xl border border-border bg-white px-4 py-2.5 text-sm text-brown outline-none transition-colors focus:border-primary"
              />
            </div>
            <div>
              <label htmlFor="birth-month" className="mb-1.5 block text-xs font-semibold text-brown-mid">
                Birth month
              </label>
              <select
                id="birth-month"
                value={birthMonth}
                onChange={(e) => setBirthMonth(e.target.value)}
                className="w-full rounded-xl border border-border bg-white px-3 py-2.5 text-sm text-brown outline-none transition-colors focus:border-primary"
              >
                <option value="">—</option>
                {MONTH_NAMES.map((m, i) => (
                  <option key={m} value={i + 1}>{m}</option>
                ))}
              </select>
            </div>
          </div>

          <label htmlFor="adoption-date" className="mt-3 mb-1.5 block text-xs font-semibold text-brown-mid">
            Gotcha Day <span className="font-normal text-brown-light">(the day they came home)</span>
          </label>
          <input
            id="adoption-date"
            type="date"
            value={adoptionDate}
            onChange={(e) => setAdoptionDate(e.target.value)}
            className="w-full rounded-xl border border-border bg-white px-4 py-2.5 text-sm text-brown outline-none transition-colors focus:border-primary"
          />
          <p className="mt-1.5 text-[11px] leading-relaxed text-brown-light">
            We celebrate the birthday month unless you tell us the exact day — and Gotcha Day on the day itself.
          </p>
        </div>

        {!complete && (
          <div className="rounded-2xl bg-cream-dark px-4 py-3 text-sm text-brown-mid">
            <p className="mb-1 font-semibold">To unlock swiping, add:</p>
            <ul className="space-y-0.5 text-xs text-brown-light">
              {photos.length < 3 && <li>• At least 3 photos ({photos.length}/3)</li>}
              {!name.trim() && <li>• Dog&apos;s name</li>}
              {!breed.trim() && <li>• Breed</li>}
              {!age && <li>• Age</li>}
              {!sex && <li>• Sex</li>}
              {(temperament.length === 0 && playStyles.length === 0) && (
                <li>• At least one temperament or play style</li>
              )}
              {!zip.trim() && !(city.trim() && usState.trim()) && <li>• ZIP code or city + state</li>}
            </ul>
          </div>
        )}

        <button
          type="submit"
          disabled={isBusy}
          className="btn-primary py-4 text-base disabled:opacity-40"
        >
          {uploading
            ? 'Uploading photos…'
            : saving
            ? 'Saving…'
            : complete
            ? 'Save & Start Swiping 🐾'
            : 'Save Profile'}
        </button>
        <p className="-mt-2 text-center text-xs text-brown-light">
          You can complete your profile later — partial saves are allowed.
        </p>
      </form>
    </div>
  );
}
