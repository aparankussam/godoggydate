'use client';
// web/components/DogProfileForm.tsx
// Dog profile form — device photo upload, breed datalist, structured location.

import { loadRevealed } from '../lib/dogtypeDiscovery';
import { computeDogtype, describeTypeChange, profileHintsForCode } from '../../shared/dogtype';
import { useEffect, useRef, useState } from 'react';
import type { SavedDogProfile } from '../lib/auth';
import { isProfileComplete } from '../lib/auth';
import { getVaccinationStatus } from '../../shared/profile';
import {
  adoptionDateProblem,
  birthDateProblem,
  birthFieldsFromPartial,
  formatUsPartial,
  maskUsDateInput,
  maskedCaretPosition,
  parseUsDateInput,
  partialFromAdoptionDate,
  partialFromBirthFields,
  partialFromIsoDate,
  rabiesExpiryProblem,
  toAdoptionDateIso,
  toIsoDate,
} from '../../shared/dates';
import { uploadDogPhoto } from '../lib/storage';
import { getFirebase } from '../shared/utils/firebase';
import { BREEDS } from '../../shared/types/breeds';
import { checkContent, CONTENT_FILTER_MESSAGE } from '../../shared/contentFilter';
import { PROFILE_TEXT_LIMITS } from '../../shared/profileInput';
import CoverPhotoEditor from './CoverPhotoEditor';
import { temperamentLabel } from '../../shared/temperament';

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
  'Calm 🧘', 'Independent 🦅', 'Loves every dog 🎉', 'Shy at first 🙈',
];

const PLAY_STYLE_OPTIONS = [
  'loves fetch 🎾', 'wrestling 🤼', 'gentle play 🐾',
  'high-energy runner ⚡', 'calm 🧘', 'explorer 👃',
];

// ── Energy: a starting value that comes from the owner's own picks ───────────
// The slider used to start at 60 and count as "answered" before anyone touched it, so
// a calm senior who skipped it was saved as 60 (a "Spark" Dogtype, "Same energy level"
// credited to an energetic puppy). Now the value starts from what the owner already
// told us, says where it came from, and is never overwritten once they move it.
//   temperament / play style cues:  high (Energetic, high-energy runner) +1,
//   playful / fetch / wrestling +0.5, gentle -0.5, calm -1   (capped at +/-2 in total)
//   value = 50 + cues * 13, puppy +5, senior -5, rounded to the slider's step of 5.
const ENERGY_CUES: Record<string, number> = {
  'Energetic ⚡': 1, 'high-energy runner ⚡': 1,
  'Playful 🎮': 0.5, 'loves fetch 🎾': 0.5, 'wrestling 🤼': 0.5,
  'Gentle 🕊️': -0.5, 'gentle play 🐾': -0.5,
  'Calm 🧘': -1, 'calm 🧘': -1,
};

type EnergySource = 'none' | 'picks' | 'quiz' | 'photos' | 'owner' | 'saved';

function suggestEnergy(input: {
  temperament: string[];
  playStyles: string[];
  age: string;
  quizLetter?: 'E' | 'Z' | null;
}): { value: number; reasons: string[]; fromQuiz: boolean } {
  const reasons: string[] = [];
  let cues = 0;
  for (const chip of [...input.temperament, ...input.playStyles]) {
    const weight = ENERGY_CUES[chip];
    if (weight) {
      cues += weight;
      reasons.push(chip);
    }
  }
  cues = Math.max(-2, Math.min(2, cues));
  const ageAdj = input.age === 'puppy' ? 5 : input.age === 'senior' ? -5 : 0;
  const ageReason = ageAdj ? [input.age] : [];
  const round = (v: number) => Math.max(10, Math.min(100, Math.round(v / 5) * 5));
  // No energy cue in the picks: the quiz answer (Energy: Spark / Zen) is the next-best signal.
  if (reasons.length === 0 && input.quizLetter) {
    return { value: round((input.quizLetter === 'E' ? 75 : 25) + ageAdj), reasons: ageReason, fromQuiz: true };
  }
  return { value: round(50 + cues * 13 + ageAdj), reasons: [...reasons, ...ageReason], fromQuiz: false };
}

function energyWord(value: number): string {
  return value >= 75 ? 'High energy' : value <= 35 ? 'Mellow' : 'Balanced';
}

// The Dogtype quiz (a separate page) leaves this behind so onboarding can pick up
// where it left off: { name?: string, code: string, at: number }.
const QUIZ_KEY = 'gdd.quiz.v1';
function readQuizCarryover(): { name: string | null; energy: 'E' | 'Z' | null; code: string | null } {
  try {
    const raw = window.localStorage.getItem(QUIZ_KEY);
    if (!raw) return { name: null, energy: null, code: null };
    const parsed = JSON.parse(raw) as { name?: unknown; code?: unknown };
    const name = typeof parsed.name === 'string' ? parsed.name.trim().slice(0, PROFILE_TEXT_LIMITS.name) : '';
    const letter = typeof parsed.code === 'string' ? parsed.code.trim().toUpperCase()[0] : '';
    const fullCode = typeof parsed.code === 'string' ? parsed.code.trim().toUpperCase() : '';
    return { name: name || null, energy: letter === 'E' || letter === 'Z' ? letter : null, code: profileHintsForCode(fullCode) ? fullCode : null };
  } catch {
    return { name: null, energy: null, code: null }; // storage blocked or not JSON: nothing to carry over
  }
}

// Safety screening. These two lists are what the matching engine reads
// (analyzeLimits in shared/utils/matchingEngine.ts: every chip below is read
// against the OTHER dog's size, age, energy, play style and flags). Values must
// match the NotGoodWith / BehaviorFlag unions in shared/types.
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

// accept="image/*" only filters the picker's list — drag-and-drop and some
// mobile pickers hand over anything — so check again. SVG is excluded: it is
// scriptable and the canvas re-encode in lib/storage.ts can't decode it. A
// missing type (some browsers for HEIC) falls back to the extension.
function photoRejection(file: File): string | null {
  if (file.size === 0) return `${file.name} is empty.`;
  const type = (file.type || '').toLowerCase();
  const isImage = type
    ? type.startsWith('image/') && !type.includes('svg')
    : /\.(jpe?g|png|webp|gif|heic|heif|avif|bmp)$/i.test(file.name);
  return isImage ? null : `${file.name} isn’t a photo.`;
}

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
  prompts: string;
  rabiesExpiry: string;
  birthDate: string;
  adoptionDate: string;
}

// Owner-typed text other dog owners will see is run through the shared
// content filter before saving (Apple guideline 1.2). The server checks the
// saved profile again and clears anything that slips past. Empty is fine.
function contentFilterError(value: string): string {
  return value.trim() && !checkContent(value).ok ? CONTENT_FILTER_MESSAGE : '';
}

// "481041234" is a ZIP+4 typed without its hyphen; accept it as 48104-1234.
function normalizeZipInput(raw: string): string {
  const trimmed = raw.trim();
  return /^\d{9}$/.test(trimmed) ? `${trimmed.slice(0, 5)}-${trimmed.slice(5)}` : trimmed;
}

function countComplete(p: {
  photos: number;
  name: string;
  breed: string;
  age: string | undefined;
  sex: string | undefined;
  size: string;
  /** undefined until the owner (or their picks) actually set it. */
  energyLevel: number | undefined;
  temperament: string[];
  playStyles: string[];
  city: string;
}): number {
  let n = 0;
  // Needs MIN_PHOTOS, like isProfileComplete — one photo used to tick this off
  // and show 100% / 9 of 9 on a profile that still couldn't swipe.
  if (p.photos >= MIN_PHOTOS) n++;
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
  prompts: '',
  rabiesExpiry: '',
  birthDate: '',
  adoptionDate: '',
};

export default function DogProfileForm({ onSaved, saving, initialProfile, focusSection }: Props) {
  const [name, setName] = useState('');
  const [breed, setBreed] = useState('');
  const [age, setAge] = useState<'puppy' | 'adult' | 'senior' | ''>('');
  const [sex, setSex] = useState<'M' | 'F' | ''>('');
  // '' until chosen. This started as 'M' and counted as answered on a blank form.
  const [size, setSize] = useState<'S' | 'M' | 'L' | 'XL' | ''>('');
  const [energyLevel, setEnergyLevel] = useState(50);
  // Where the slider's value came from. Only 'owner' / 'saved' / 'photos' are never
  // recomputed from the picks.
  const [energySource, setEnergySource] = useState<EnergySource>('none');
  const [quizEnergy, setQuizEnergy] = useState<'E' | 'Z' | null>(null);
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
  // Typed as US MM/DD/YYYY, stored as 'YYYY-MM-DD' — stored shape unchanged.
  const [rabiesExpiry, setRabiesExpiry] = useState('');
  // Birthday & Gotcha Day (both optional) — ONE US MM/DD/YYYY box each, still
  // stored as the same three numbers / polymorphic string as before. Partial
  // entry is preserved: "06/2021" for month+year, and the birthday even takes a
  // bare "2021".
  const [birthDate, setBirthDate] = useState('');
  const [adoptionDateInput, setAdoptionDateInput] = useState('');
  const [prompts, setPrompts] = useState(
    DEFAULT_PROMPTS.map((prompt) => ({ prompt, answer: '' })),
  );
  const [photos, setPhotos] = useState<PhotoItem[]>([]);
  // Owner's cover-photo choice + crop focal point (0–100). -1 index = "not set,
  // fall back to the AI hero pick"; a real drag/selection sets a concrete index.
  const [coverPhotoIndex, setCoverPhotoIndex] = useState<number>(-1);
  const [coverFocusX, setCoverFocusX] = useState<number>(50);
  const [coverFocusY, setCoverFocusY] = useState<number>(50);
  const [submitted, setSubmitted] = useState(false);
  const [errors, setErrors] = useState<ValidationErrors>(EMPTY_ERRORS);
  const [uploading, setUploading] = useState(false);
  // Why a picked file was skipped, and why a save attempt failed — neither
  // used to say anything, so a bad photo just vanished or "Save" did nothing.
  const [photoNotice, setPhotoNotice] = useState('');
  const [submitError, setSubmitError] = useState('');

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
  // Also the 'Add birth date' deep-link target from LifeStageCard.
  const birthDateRef = useRef<HTMLInputElement | null>(null);
  const adoptionDateRef = useRef<HTMLInputElement | null>(null);
  const zipRef = useRef<HTMLInputElement | null>(null);
  const locationRef = useRef<HTMLInputElement | null>(null);
  const promptsRef = useRef<HTMLDivElement | null>(null);
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
    if (focusSection === 'birthday' && birthDateRef.current) {
      birthDateRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
      const t = window.setTimeout(() => birthDateRef.current?.focus(), 250);
      return () => window.clearTimeout(t);
    }
  }, [focusSection]);

  // Pick up where the Dogtype quiz left off (first-time onboarding only): the dog's
  // name, and the quiz's Energy answer as a fallback starting point for the slider.
  // Never touches a name the owner has already typed.
  useEffect(() => {
    if (initialProfile) return;
    const carried = readQuizCarryover();
    if (carried.name) setName((current) => current || carried.name || '');
    setQuizEnergy(carried.energy);
    // The quiz showed a Dogtype. Start the profile from the answers that produce that same
    // type, so signing up never turns "The Zoomie Menace" into something else. Only fills
    // what is still empty; the owner can change every one of them.
    const hints = carried.code ? profileHintsForCode(carried.code) : null;
    if (hints) {
      setEnergyLevel(hints.energyLevel);
      setEnergySource('owner');
      setPlayStyles((cur) => (cur.length > 0 ? cur : hints.playStyles));
      setBehaviorFlags((cur) => (cur.length > 0 ? cur : hints.behaviorFlags));
      setTemperament((cur) => (cur.length > 0 ? cur : hints.temperament));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Starting energy from the owner's own picks, until THEY move the slider (or a saved
  // value / the photo read set it). Recomputed as the picks change, never over an owner's value.
  useEffect(() => {
    if (energySource === 'owner' || energySource === 'saved' || energySource === 'photos') return;
    const suggestion = suggestEnergy({ temperament, playStyles, age, quizLetter: quizEnergy });
    setEnergyLevel(suggestion.value);
    setEnergySource(suggestion.fromQuiz ? 'quiz' : suggestion.reasons.length > 0 ? 'picks' : 'none');
  }, [temperament, playStyles, age, quizEnergy, energySource]);

  useEffect(() => {
    if (!initialProfile) return;

    setName(initialProfile.name ?? '');
    setBreed(initialProfile.breed ?? '');
    setAge(initialProfile.age ?? '');
    setSex(initialProfile.sex ?? '');
    setSize(initialProfile.size ?? '');
    if (typeof initialProfile.energyLevel === 'number') {
      setEnergyLevel(initialProfile.energyLevel);
      setEnergySource('saved');
    }
    setTemperament((initialProfile.temperament ?? []).map(temperamentLabel));
    setPlayStyles(initialProfile.playStyles ?? []);
    setNotGoodWith(initialProfile.notGoodWith ?? []);
    setBehaviorFlags(initialProfile.behaviorFlags ?? []);
    setVaccinated(initialProfile.vaccinated ?? null);
    setRabiesExpiry(formatUsPartial(partialFromIsoDate(initialProfile.rabiesExpiry)));
    setBirthDate(formatUsPartial(partialFromBirthFields(
      initialProfile.birthYear, initialProfile.birthMonth, initialProfile.birthDay,
    )));
    // adoptionDate may be 'YYYY-MM-DD' (exact) or 'YYYY-MM' (month only).
    setAdoptionDateInput(formatUsPartial(partialFromAdoptionDate(initialProfile.adoptionDate)));
    setCoverPhotoIndex(typeof initialProfile.coverPhotoIndex === 'number' ? initialProfile.coverPhotoIndex : -1);
    setCoverFocusX(typeof initialProfile.coverFocusX === 'number' ? initialProfile.coverFocusX : 50);
    setCoverFocusY(typeof initialProfile.coverFocusY === 'number' ? initialProfile.coverFocusY : 50);
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
    } else if (/^\d{5}(-\d{4})?$/.test(locStr.trim())) {
      // A ZIP-only profile stores the ZIP as its `location`. Reading that back
      // as a city put the private ZIP in the City box, and the next save
      // published it as the public city on the dog doc.
      setCity('');
      setUsState('');
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

  // Mask a date box as the owner types AND keep the caret where they were
  // editing. Setting a different value than the DOM holds sends the caret to
  // the end, so a mid-string edit (backspace over a slash, insert a digit) used
  // to jump away and garble the next keystroke.
  function handleDateInput(e: React.ChangeEvent<HTMLInputElement>, set: (v: string) => void) {
    const el = e.target;
    const raw = el.value;
    const caret = el.selectionStart ?? raw.length;
    const masked = maskUsDateInput(raw);
    set(masked);
    if (masked !== raw && caret < raw.length) {
      const pos = maskedCaretPosition(raw, caret, masked);
      // A microtask, not rAF: it runs after React has committed (or restored)
      // the controlled value but before the next keystroke can be handled.
      queueMicrotask(() => {
        try { el.setSelectionRange(pos, pos); } catch { /* input went away */ }
      });
    }
  }

  function toggleTag(tag: string, list: string[], setList: (v: string[]) => void) {
    setList(list.includes(tag) ? list.filter((x) => x !== tag) : [...list, tag]);
  }

  function setPromptAnswer(i: number, answer: string) {
    setPrompts((prev) => prev.map((prompt, idx) => (idx === i ? { ...prompt, answer } : prompt)));
  }

  function handlePhotoFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(e.target.files ?? []);
    const notices: string[] = [];
    const usable = picked.filter((file) => {
      const reason = photoRejection(file);
      if (reason) notices.push(reason);
      return !reason;
    });
    const room = Math.max(0, MAX_PHOTOS - photos.length);
    if (usable.length > room) {
      notices.push(`Only ${MAX_PHOTOS} photos fit — ${usable.length - room} skipped.`);
    }
    setPhotoNotice(notices.join(' '));
    const files = usable.slice(0, room);
    if (files.length === 0) {
      e.target.value = '';
      return;
    }

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
    setPhotoNotice('');
    // Compute the removed index from current state BEFORE the setPhotos updater
    // (which can run twice under StrictMode) so the cover setters below fire
    // exactly once.
    const removedIndex = photos.findIndex((item) => item.id === photoId);
    const photo = photos.find((item) => item.id === photoId);
    if (photo?.preview) {
      URL.revokeObjectURL(photo.preview);
      previewUrlsRef.current = previewUrlsRef.current.filter((url) => url !== photo.preview);
    }
    setPhotos((prev) => prev.filter((item) => item.id !== photoId));

    // Keep the cover pick pointing at the SAME photo: removing the cover itself
    // resets the pick + crop; removing an earlier photo shifts the index down.
    // Without this the saved index silently points at a different photo — the
    // exact stale-crop bug the cover feature exists to prevent.
    if (removedIndex !== -1 && coverPhotoIndex >= 0) {
      if (removedIndex === coverPhotoIndex) {
        setCoverPhotoIndex(-1);
        setCoverFocusX(50);
        setCoverFocusY(50);
      } else if (removedIndex < coverPhotoIndex) {
        setCoverPhotoIndex(coverPhotoIndex - 1);
      }
    }
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
      if (typeof vc.energyEstimate === 'number' && energySource !== 'owner' && energySource !== 'saved') {
        setEnergyLevel(vc.energyEstimate);
        setEnergySource('photos');
      }
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
      name: !name.trim() ? 'Required' : contentFilterError(name),
      breed: !breed.trim() ? 'Required' : contentFilterError(breed),
      age: !age ? 'Required' : '',
      sex: !sex ? 'Required' : '',
      size: !size ? 'Required' : '',
      energy: energySource !== 'none' && Number.isFinite(energyLevel) ? '' : 'Drag the slider to set your dog’s energy',
      zip: hasZip && !/^\d{5}(-\d{4})?$/.test(normalizeZipInput(zip)) ? "That ZIP doesn't smell right" : '',
      // The city is saved even when a ZIP is given, so it's always checked.
      city: !hasZip && !hasCity ? 'Enter a city or use ZIP' : contentFilterError(city),
      state: !hasZip && hasCity && !hasState ? 'Select a state' : '',
      personality: temperament.length === 0 && playStyles.length === 0 ? 'Pick at least one' : '',
      prompts: prompts.some((prompt) => contentFilterError(prompt.answer)) ? CONTENT_FILTER_MESSAGE : '',
      // The three date fields below are OPTIONAL — blank stays valid and still
      // clears the stored value. But a NON-EMPTY value that can't be parsed
      // MUST block the save: these used to coerce silently to null, and because
      // saves are { merge: true } that null is WRITTEN, so one typo would
      // permanently delete a date the owner had already entered correctly.
      // (The old <select>s made a bad date unenterable; a free-text box can't.)
      //
      // An expiry in the PAST is valid input and must stay savable: "expired"
      // is the state this field exists to surface.
      rabiesExpiry: (() => {
        if (!rabiesExpiry.trim()) return '';
        const parsed = parseUsDateInput(rabiesExpiry);
        if (!parsed.ok || !toIsoDate(parsed.value)) return 'Use MM/DD/YYYY, like 04/18/2027';
        return rabiesExpiryProblem(parsed.value) ?? '';
      })(),
      birthDate: (() => {
        if (!birthDate.trim()) return '';
        const parsed = parseUsDateInput(birthDate);
        if (!parsed.ok) return 'Use MM/DD/YYYY — or just 06/2021, or 2021';
        return birthDateProblem(parsed.value) ?? '';
      })(),
      adoptionDate: (() => {
        if (!adoptionDateInput.trim()) return '';
        const parsed = parseUsDateInput(adoptionDateInput);
        if (!parsed.ok) return 'Use MM/DD/YYYY — or just 06/2021';
        // Year-only has no stored form for Gotcha Day — say so rather than
        // inventing a January date and firing a wrong celebration push.
        if (!toAdoptionDateIso(parsed.value)) return 'Add at least the month, like 06/2021';
        return adoptionDateProblem(parsed.value) ?? '';
      })(),
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
      'prompts',
      'rabiesExpiry',
      'birthDate',
      'adoptionDate',
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
      prompts: promptsRef.current,
      rabiesExpiry: rabiesExpiryRef.current,
      // birthDateRef is also the 'Add birth date' deep-link target from
      // LifeStageCard — see the scroll/focus effect above.
      birthDate: birthDateRef.current,
      adoptionDate: adoptionDateRef.current,
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
    // Counts only once it has a source: the owner moved it, their picks set it, or it was saved.
    energyLevel: energySource === 'none' ? undefined : energyLevel,
    temperament,
    playStyles,
    city: zip.trim() || city,
  });
  const progressPct = Math.round((completedCount / 9) * 100);

  // Same helper every rendering surface uses, so the preview below the form
  // cannot drift from what the swipe card actually says.
  // rabiesExpiry state is US MM/DD/YYYY; getVaccinationStatus reads strict
  // ISO, so convert at this boundary or the preview silently drops the date.
  const vaccinationPreview = (() => {
    const parsed = parseUsDateInput(rabiesExpiry);
    return getVaccinationStatus({
      rabiesExpiry: parsed.ok ? toIsoDate(parsed.value) : null,
      vaccinated,
    });
  })();

  const zipStr = normalizeZipInput(zip);
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
    size: size || undefined,
    energyLevel: energySource === 'none' ? undefined : energyLevel,
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

    // Editing can change the dog's Dogtype (read from energy, play style, sociability and
    // temperament). Say so before saving, so a new type is never a surprise.
    if (initialProfile) {
      const change = describeTypeChange(
        computeDogtype(initialProfile)?.code,
        computeDogtype({ energyLevel, playStyles, behaviorFlags, notGoodWith, temperament })?.code,
        loadRevealed(getFirebase().auth.currentUser?.uid ?? ''),
      );
      if (change.changed && !window.confirm(`${change.message!.replace('{name}', name.trim() || initialProfile.name || 'your dog')}\n\nSave anyway?`)) {
        return;
      }
    }

    setSubmitError('');
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
        size: size as 'S' | 'M' | 'L' | 'XL', // validated non-empty above
        energyLevel,
        temperament,
        playStyles,
        notGoodWith,
        behaviorFlags,
        photos: photosFinal,
        // Cover-photo override + focal point. Only persisted once the owner has
        // actually chosen (index >= 0 and pointing at a real photo); otherwise
        // omitted so the AI hero pick + centre crop stay in charge.
        // null (not undefined) when unset/out-of-range: stripUndefined() drops
        // undefined before the { merge: true } write, which would keep a STALE
        // cover pointing at a since-deleted photo (same contract as adoptionDate).
        coverPhotoIndex: coverPhotoIndex >= 0 && coverPhotoIndex < realUrls.length ? coverPhotoIndex : null,
        coverFocusX: coverPhotoIndex >= 0 && coverPhotoIndex < realUrls.length ? coverFocusX : null,
        coverFocusY: coverPhotoIndex >= 0 && coverPhotoIndex < realUrls.length ? coverFocusY : null,
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
        // Typed as US MM/DD/YYYY, stored as 'YYYY-MM-DD' — stored shape
        // unchanged. getValidationErrors() has already blocked a non-empty
        // unparseable value, so null here means the owner really did clear it.
        rabiesExpiry: (() => {
          const parsed = parseUsDateInput(rabiesExpiry);
          return parsed.ok ? toIsoDate(parsed.value) : null;
        })(),
        // Birthday & Gotcha Day — the SAME stored fields and rules as before,
        // now derived by the shared helpers so web and mobile can't drift.
        // null (not undefined) when empty so a cleared value actually clears
        // under { merge: true } — undefined is stripped and would keep the
        // stale value.
        ...(() => {
          const parsed = parseUsDateInput(birthDate);
          return birthFieldsFromPartial(parsed.ok ? parsed.value : null);
        })(),
        adoptionDate: (() => {
          const parsed = parseUsDateInput(adoptionDateInput);
          return parsed.ok ? toAdoptionDateIso(parsed.value) : null;
        })(),
        prompts: prompts
          .map((prompt) => ({ ...prompt, answer: prompt.answer.trim() }))
          .filter((prompt) => prompt.answer),
      });
    } catch (err) {
      // A photo that can't be read or uploaded. This had no catch, so the
      // button just went back to "Save" and nothing said why.
      setSubmitError(
        err instanceof Error && err.message
          ? err.message
          : 'We couldn’t upload your photos. Check your connection and try again.',
      );
    } finally {
      setUploading(false);
    }
  }

  const isBusy = uploading || saving;

  return (
    <div className="flex min-h-[80vh] flex-col items-center justify-start px-6 py-8">
      <p className="mb-3 text-4xl">🐾</p>
      <h2 className="mb-1 font-display text-3xl text-brown">Set up your dog&apos;s profile</h2>
      <p className="mb-4 text-center text-sm font-semibold text-brown">
        Helps us find the right matches for your pup.
      </p>

      <div className="card mb-6 w-full max-w-sm px-4 py-3">
        <div className="mb-1.5 flex justify-between gap-2 text-xs font-semibold text-brown-light">
          <span>{completedCount}/9 sections complete</span>
          <span className={complete ? 'font-extrabold text-brown' : 'font-extrabold text-rose'}>
            {complete ? '✓ Ready to swipe!' : `${progressPct}% — complete to unlock swipe`}
          </span>
        </div>
        <div className="h-3 overflow-hidden rounded-full border-2 border-ink bg-cream-dark">
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{
              width: `${progressPct}%`,
              backgroundColor: complete ? '#2A1F4A' : '#FF5C8D',
            }}
          />
        </div>
      </div>

      <form onSubmit={handleSubmit} className="flex w-full max-w-sm flex-col gap-5">
        <div ref={photosRef} tabIndex={-1} role="group" aria-labelledby="dog-photos-label" className="card p-4">
          <label id="dog-photos-label" className="mb-2 block font-display text-xl text-brown">
            Photos <span className="font-body text-sm font-semibold text-brown-light">({MIN_PHOTOS} required, up to {MAX_PHOTOS})</span>
          </label>
          {photos.length > 0 && (
            <div className="grid grid-cols-3 gap-2">
              {photos.map((photo, index) => (
                <div key={photo.id} className="relative aspect-square overflow-hidden rounded-2xl border-2 border-ink bg-cream-dark">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={photo.preview ?? photo.url}
                    alt={`Photo ${index + 1}`}
                    className="h-full w-full object-cover"
                  />
                  <button
                    type="button"
                    onClick={() => removePhoto(photo.id)}
                    className="absolute right-0 top-0 flex h-10 w-10 items-center justify-center text-sm text-white"
                    aria-label={`Remove photo ${index + 1}`}
                  >
                    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-black/55">×</span>
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Cover photo + reposition — the owner picks the card's hero shot and
              drags the focal point so a center-crop doesn't hide the face. */}
          {photos.length > 0 && (
            <div className="mt-4 rounded-2xl border-2 border-dashed border-ink/40 bg-cream-dark/60 p-3">
              <p className="mb-2 text-xs font-extrabold text-brown">
                🖼 Cover photo <span className="font-normal text-brown-light">— what shows on your card</span>
              </p>
              <CoverPhotoEditor
                photos={photos.map((p) => p.preview ?? p.url ?? '')}
                coverIndex={coverPhotoIndex >= 0 ? coverPhotoIndex : (initialProfile?.ai?.vibeCheck?.heroPhotoIndex ?? 0)}
                focusX={coverFocusX}
                focusY={coverFocusY}
                onChange={({ coverIndex, focusX, focusY }) => {
                  setCoverPhotoIndex(coverIndex);
                  setCoverFocusX(focusX);
                  setCoverFocusY(focusY);
                }}
              />
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
              className="btn-secondary px-4 py-2.5 text-sm disabled:opacity-40"
            >
              {photos.length > 0 ? 'Add more photos' : 'Upload photos'}
            </button>
            <span className="text-xs text-brown-light">{photos.length}/{MAX_PHOTOS}</span>
          </div>
          <p className="mt-1.5 text-[11px] leading-relaxed text-brown-light">
            Choose images from your device. The first photo becomes the main card image.
          </p>
          {photoNotice && <p role="status" className="mt-1 text-xs text-amber-700">{photoNotice}</p>}
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
              className="btn-secondary mt-3 w-full px-4 py-2.5 text-sm disabled:opacity-50"
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
            <div className="mt-3 rounded-2xl border-2 border-ink bg-note px-4 py-3">
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

        <section className="card flex flex-col gap-5 p-4" aria-label="The basics">
          <h3 className="-mb-2 font-display text-xl text-brown">The basics</h3>
        <div>
          <label htmlFor="dog-name" className="mb-1.5 block text-sm font-extrabold text-brown">Dog&apos;s name</label>
          <input
            id="dog-name"
            ref={nameRef}
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={PROFILE_TEXT_LIMITS.name}
            autoCapitalize="words"
            placeholder="e.g. Kaju"
            className="w-full rounded-xl border-2 border-ink bg-white px-4 py-2.5 text-base text-brown outline-none transition-colors focus:border-primary"
          />
          {errors.name && <p className="mt-1 text-xs text-red-500">{errors.name}</p>}
        </div>

        <div>
          <label htmlFor="dog-breed" className="mb-1.5 block text-sm font-extrabold text-brown">Breed</label>
          <input
            id="dog-breed"
            ref={breedRef}
            list="breed-list"
            value={breed}
            onChange={(e) => setBreed(e.target.value)}
            maxLength={PROFILE_TEXT_LIMITS.breed}
            autoCapitalize="words"
            placeholder="e.g. Golden Retriever, Dachshund Mix"
            className="w-full rounded-xl border-2 border-ink bg-white px-4 py-2.5 text-base text-brown outline-none transition-colors focus:border-primary"
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
          <label id="dog-age-label" className="mb-1.5 block text-sm font-extrabold text-brown">Age</label>
          <div className="flex gap-2" role="group" aria-labelledby="dog-age-label">
            {AGE_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setAge(option.value)}
                aria-pressed={age === option.value}
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
          <label id="dog-sex-label" className="mb-1.5 block text-sm font-extrabold text-brown">Sex</label>
          <div className="flex gap-3" role="radiogroup" aria-labelledby="dog-sex-label">
            {([
              { value: 'M', label: 'Male' },
              { value: 'F', label: 'Female' },
            ] as const).map((option) => (
              <label
                key={option.value}
                className={`flex min-h-[44px] flex-1 cursor-pointer items-center justify-center rounded-full border-2 px-4 py-2.5 text-sm font-extrabold transition-colors ${
                  sex === option.value
                    ? 'border-ink bg-ink text-cream'
                    : 'border-ink bg-cream text-brown'
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
          <label id="dog-size-label" className="mb-1.5 block text-sm font-extrabold text-brown">Size</label>
          <div className="flex gap-2" role="group" aria-labelledby="dog-size-label">
            {SIZES.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setSize(option.value)}
                aria-pressed={size === option.value}
                className={`chip min-h-[40px] flex-1 justify-center text-xs ${size === option.value ? 'chip-active' : ''}`}
              >
                {option.label}
              </button>
            ))}
          </div>
          {errors.size && <p className="mt-1 text-xs text-red-500">{errors.size}</p>}
        </div>
        </section>

        <section className="card flex flex-col gap-5 p-4" aria-label="Personality">
          <h3 className="-mb-2 font-display text-xl text-brown">Personality</h3>
        <div>
          <label htmlFor="dog-energy" className="mb-1.5 block text-sm font-extrabold text-brown">
            Energy level{' '}
            {energySource === 'none' ? (
              <span className="font-bold text-brown-light">not set yet</span>
            ) : (
              <span className="font-bold text-rose">
                {energyLevel}% · {energyWord(energyLevel)}
              </span>
            )}
          </label>
          <input
            id="dog-energy"
            ref={energyRef}
            type="range"
            min={10}
            max={100}
            step={5}
            value={energyLevel}
            data-source={energySource}
            onChange={(e) => {
              // Once the owner moves it, it is theirs: picks no longer recompute it.
              setEnergyLevel(Number(e.target.value));
              setEnergySource('owner');
            }}
            className={`h-10 w-full ${energySource === 'none' ? 'accent-brown-light opacity-60' : 'accent-primary'}`}
          />
          <div className="mt-1 flex justify-between text-xs text-brown-light">
            <span>Chill 🧘</span>
            <span>Energetic ⚡</span>
          </div>
          {/* Say where the number came from, so an estimate is never mistaken for an answer. */}
          <p data-testid="energy-note" className={`mt-1 text-[11px] leading-snug ${energySource === 'none' ? 'text-amber-700' : 'text-brown-light'}`}>
            {energySource === 'none' && 'Not set yet. Pick temperament and play style below, or drag the slider.'}
            {energySource === 'picks' && `Auto-set from your picks (${suggestEnergy({ temperament, playStyles, age, quizLetter: null }).reasons.join(', ')}). Drag to change.`}
            {energySource === 'quiz' && 'Auto-set from your Dogtype quiz answer. Drag to change.'}
            {energySource === 'photos' && 'Estimated from the photos. Drag to change.'}
            {energySource === 'saved' && 'Saved from before. Drag to change.'}
            {energySource === 'owner' && 'Set by you.'}
            {energySource === 'owner' && (temperament.length > 0 || playStyles.length > 0 || quizEnergy) && (
              <>
                {' '}
                <button
                  type="button"
                  onClick={() => {
                    // Straight back to the suggestion, in one step (no frame of "not set yet").
                    const suggestion = suggestEnergy({ temperament, playStyles, age, quizLetter: quizEnergy });
                    setEnergyLevel(suggestion.value);
                    setEnergySource(suggestion.fromQuiz ? 'quiz' : suggestion.reasons.length > 0 ? 'picks' : 'none');
                  }}
                  className="font-semibold text-rose underline underline-offset-2"
                >
                  Use my picks instead
                </button>
              </>
            )}
          </p>
          {errors.energy && <p className="mt-1 text-xs text-red-500">{errors.energy}</p>}
        </div>

        <div>
          <label id="dog-temperament-label" className="mb-1.5 block text-sm font-extrabold text-brown">
            Temperament <span className="font-normal text-brown-light">(pick any)</span>
          </label>
          <div className="flex flex-wrap gap-2" role="group" aria-labelledby="dog-temperament-label">
            {TEMPERAMENT_OPTIONS.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => toggleTag(option, temperament, setTemperament)}
                aria-pressed={temperament.includes(option)}
                className={`chip min-h-[40px] text-xs ${temperament.includes(option) ? 'chip-active' : ''}`}
              >
                {option}
              </button>
            ))}
          </div>
          {errors.personality && <p className="mt-1 text-xs text-red-500">{errors.personality}</p>}
        </div>

        <div>
          <label id="dog-playstyle-label" className="mb-1.5 block text-sm font-extrabold text-brown">
            Play style <span className="font-normal text-brown-light">(pick any)</span>
          </label>
          <div className="flex flex-wrap gap-2" role="group" aria-labelledby="dog-playstyle-label">
            {PLAY_STYLE_OPTIONS.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => toggleTag(option, playStyles, setPlayStyles)}
                aria-pressed={playStyles.includes(option)}
                className={`chip min-h-[40px] text-xs ${playStyles.includes(option) ? 'chip-active' : ''}`}
              >
                {option}
              </button>
            ))}
          </div>
        </div>

        </section>

        {/* Safety screening — what the matching engine reads against every other
            dog (size, age, energy, play style). Optional on purpose: most dogs
            have nothing to declare, and forcing a choice would push people to
            click something untrue. */}
        <div className="card p-4">
          <h3 className="font-display text-xl text-brown">Safety</h3>
          <p className="mt-0.5 text-[11px] leading-relaxed text-brown-light">
            Other owners see these on your dog&apos;s card in your name (&ldquo;{name.trim() || 'Your dog'}&apos;s
            owner prefers no puppies&rdquo;), and the app ranks dogs that clash with them lower. Nobody
            verifies them. Skip anything that doesn&apos;t apply.
          </p>

          <label id="dog-notgoodwith-label" className="mt-3 mb-1.5 block text-xs font-extrabold text-brown">
            Not a good match with
          </label>
          <div className="flex flex-wrap gap-2" role="group" aria-labelledby="dog-notgoodwith-label">
            {NOT_GOOD_WITH_OPTIONS.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => toggleTag(option, notGoodWith, setNotGoodWith)}
                aria-pressed={notGoodWith.includes(option)}
                className={`chip min-h-[40px] text-xs ${notGoodWith.includes(option) ? 'chip-active' : ''}`}
              >
                {option}
              </button>
            ))}
          </div>

          <label id="dog-behavior-label" className="mt-4 mb-1.5 block text-xs font-extrabold text-brown">
            Good to know before meeting
          </label>
          <div className="flex flex-wrap gap-2" role="group" aria-labelledby="dog-behavior-label">
            {BEHAVIOR_FLAG_OPTIONS.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => toggleTag(option, behaviorFlags, setBehaviorFlags)}
                aria-pressed={behaviorFlags.includes(option)}
                className={`chip min-h-[40px] text-xs ${behaviorFlags.includes(option) ? 'chip-active' : ''}`}
              >
                {option}
              </button>
            ))}
          </div>
        </div>

        <div className="card p-4">
          <label id="dog-location-label" className="mb-2 block font-display text-xl text-brown">Location</label>
          <div className="flex flex-col gap-2" role="group" aria-labelledby="dog-location-label">
            <input
              ref={zipRef}
              aria-label="ZIP code"
              value={zip}
              onChange={(e) => setZip(e.target.value)}
              maxLength={PROFILE_TEXT_LIMITS.zip}
              inputMode="numeric"
              placeholder="ZIP code"
              className="w-full rounded-xl border-2 border-ink bg-white px-4 py-2.5 text-base text-brown outline-none transition-colors focus:border-primary"
            />
            {errors.zip && <p className="-mt-1 text-xs text-red-500">{errors.zip}</p>}
            <div className="flex items-center gap-2 text-xs text-brown-light">
              <span className="h-0.5 flex-1 bg-ink/20" />
              <span className="font-bold">or</span>
              <span className="h-0.5 flex-1 bg-ink/20" />
            </div>
            <div className="flex gap-2">
              <input
              ref={locationRef}
              aria-label="City or neighborhood"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              maxLength={PROFILE_TEXT_LIMITS.city}
              autoCapitalize="words"
              placeholder="City or neighborhood"
              className="min-w-0 flex-1 rounded-xl border-2 border-ink bg-white px-4 py-2.5 text-base text-brown outline-none transition-colors focus:border-primary"
            />
            <select
              ref={stateRef}
              value={usState}
              onChange={(e) => setUsState(e.target.value)}
              className="w-24 appearance-none rounded-xl border-2 border-ink bg-white px-2 py-2.5 text-center text-base text-brown outline-none transition-colors focus:border-primary"
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
          {/* Said BEFORE saving: a ZIP is private and never published, so a profile
              with only a ZIP is invisible to other dogs. City + state is what makes
              it discoverable. */}
          <p data-testid="location-help" className="mt-2 text-[11px] leading-relaxed text-brown-light">
            <span className="font-semibold text-brown-mid">City + state</span> makes {name.trim() || 'your dog'} discoverable to
            nearby dogs (we show the city, never an address). A{' '}
            <span className="font-semibold text-brown-mid">ZIP alone</span> stays private, and other dogs
            won&apos;t see {name.trim() ? `${name.trim()}'s` : 'your'} profile.
          </p>
          {zip.trim() && !(city.trim() && usState.trim()) && (
            <p role="status" className="mt-2 rounded-lg border-l-4 border-amber-spine bg-amber px-2.5 py-1.5 text-[11px] leading-snug text-amber-900">
              With only a ZIP, other dogs can&apos;t see this profile yet. Add a city and state to be discoverable.
            </p>
          )}
        </div>

        <div ref={promptsRef} tabIndex={-1} className="card p-4">
          <label id="dog-about-label" className="mb-2 block font-display text-xl text-brown">
            About your dog <span className="font-body text-sm font-semibold text-brown-light">(optional)</span>
          </label>
          <div className="flex flex-col gap-3" role="group" aria-labelledby="dog-about-label">
            {prompts.map((prompt, i) => {
              // Only marked after a save attempt, like the other fields.
              const refused = !!errors.prompts && !!contentFilterError(prompt.answer);
              return (
                <div key={prompt.prompt}>
                  <p className="mb-1 text-xs font-bold text-brown-mid">{prompt.prompt}</p>
                  <input
                    aria-label={prompt.prompt}
                    value={prompt.answer}
                    onChange={(e) => setPromptAnswer(i, e.target.value)}
                    maxLength={PROFILE_TEXT_LIMITS.promptAnswer}
                    placeholder="Your answer…"
                    aria-invalid={refused}
                    className={`w-full rounded-xl border-2 bg-white px-4 py-2.5 text-base text-brown outline-none transition-colors focus:border-primary ${
                      refused ? 'border-red-500' : 'border-ink'
                    }`}
                  />
                </div>
              );
            })}
          </div>
          {errors.prompts && <p className="mt-1 text-xs text-red-500">{errors.prompts}</p>}
        </div>

        {/* Vaccination. The date is the real artifact here: `vaccinated` was a
            boolean initialised to true, so it recorded a default rather than an
            answer — and that default was rendered as a green ✓ pill on the swipe
            card and published on the public /d page. A rabies expiry is read off
            an actual certificate, and it's the date owners hunt for at every
            boarding, daycare, grooming and lease check-in. Optional: with no
            date, everything downstream degrades to an attributed "owner
            marked …" or an honest blank — never a verification. */}
        <div className="card p-4">
          <h3 className="font-display text-xl text-brown">Vaccination</h3>
          <p className="mt-0.5 text-[11px] leading-relaxed text-brown-light">
            Nobody verifies any of this. Other owners see it attributed to you, exactly as you enter it.
          </p>

          <label htmlFor="rabies-expiry" className="mt-3 mb-1.5 block text-xs font-extrabold text-brown">
            Rabies expiry date <span className="font-normal text-brown-light">(optional)</span>
          </label>
          {/* Masked text rather than <input type="date">: the native picker
              renders in the BROWSER's locale (so a non-US browser shows a
              non-US order) and mobile teaches MM/DD/YYYY for this same field.
              One format for one field, on both platforms. */}
          <input
            id="rabies-expiry"
            ref={rabiesExpiryRef}
            type="text"
            inputMode="numeric"
            placeholder="MM/DD/YYYY"
            maxLength={10}
            value={rabiesExpiry}
            onChange={(e) => handleDateInput(e, setRabiesExpiry)}
            aria-invalid={!!errors.rabiesExpiry}
            className={`w-full rounded-xl border-2 bg-white px-4 py-2.5 text-base text-brown outline-none transition-colors focus:border-primary ${
              errors.rabiesExpiry ? 'border-red-500' : 'border-ink'
            }`}
          />
          <p className="mt-1.5 text-[11px] leading-relaxed text-brown-light">
            The date printed on the certificate — the one boarding, daycare, groomers and landlords all
            ask for. Keep it here and you&apos;ll stop digging through email for it.
          </p>
          {errors.rabiesExpiry && <p className="mt-1 text-xs text-red-500">{errors.rabiesExpiry}</p>}

          <label id="dog-vaccinated-label" className="mt-4 mb-1.5 block text-xs font-extrabold text-brown">
            No certificate handy?
          </label>
          <div className="flex gap-3" role="group" aria-labelledby="dog-vaccinated-label">
            {([true, false] as const).map((value) => (
              <button
                key={String(value)}
                type="button"
                // Tapping the selected answer clears it back to null. Without a
                // route back to "unanswered", a mis-tap would be permanent — and
                // "unanswered" is the whole point of this field now.
                onClick={() => setVaccinated(vaccinated === value ? null : value)}
                aria-pressed={vaccinated === value}
                className={`min-h-[44px] flex-1 rounded-full border-2 py-2.5 text-sm font-extrabold transition-colors ${
                  vaccinated === value
                    ? value
                      ? 'border-ink bg-ink text-cream'
                      : 'border-ink bg-amber text-brown'
                    : 'border-ink bg-cream text-brown'
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
        <div className="card p-4">
          <h3 className="font-display text-xl text-brown">🎂 Birthday &amp; milestones</h3>
          <p className="mt-0.5 text-[11px] leading-relaxed text-brown-light">
            Optional — unlocks {name.trim() || 'your dog'}&apos;s life stage plus birthday and Gotcha Day
            celebrations.
          </p>

          <label htmlFor="birth-date" className="mt-3 mb-1.5 block text-xs font-extrabold text-brown">
            🎂 Birthday
          </label>
          <input
            id="birth-date"
            ref={birthDateRef}
            type="text"
            inputMode="numeric"
            placeholder="MM/DD/YYYY"
            maxLength={10}
            value={birthDate}
            onChange={(e) => handleDateInput(e, setBirthDate)}
            aria-invalid={!!errors.birthDate}
            className={`w-full rounded-xl border-2 bg-white px-3 py-2.5 text-base text-brown outline-none transition-colors focus:border-primary ${
              errors.birthDate ? 'border-red-500' : 'border-ink'
            }`}
          />
          {errors.birthDate && <p className="mt-1 text-xs text-red-500">{errors.birthDate}</p>}

          <label htmlFor="gotcha-date" className="mt-4 mb-1.5 block text-xs font-extrabold text-brown">
            🏡 Gotcha Day <span className="font-normal text-brown-light">(the day they came home)</span>
          </label>
          <input
            id="gotcha-date"
            ref={adoptionDateRef}
            type="text"
            inputMode="numeric"
            placeholder="MM/DD/YYYY"
            maxLength={10}
            value={adoptionDateInput}
            onChange={(e) => handleDateInput(e, setAdoptionDateInput)}
            aria-invalid={!!errors.adoptionDate}
            className={`w-full rounded-xl border-2 bg-white px-3 py-2.5 text-base text-brown outline-none transition-colors focus:border-primary ${
              errors.adoptionDate ? 'border-red-500' : 'border-ink'
            }`}
          />
          {errors.adoptionDate && <p className="mt-1 text-xs text-red-500">{errors.adoptionDate}</p>}

          <p className="mt-1.5 text-[11px] leading-relaxed text-brown-light">
            Don&apos;t know the exact day? Month and year is enough — type 06/2021 and we&apos;ll celebrate the
            month. For the birthday, even just the year (2021) works.
          </p>
        </div>

        {!complete && (
          <div className="rounded-2xl border-2 border-ink bg-cream-dark px-4 py-3 text-sm text-brown">
            <p className="mb-1 font-extrabold">To unlock swiping, add:</p>
            <ul className="space-y-0.5 text-xs font-semibold text-brown-mid">
              {photos.length < 3 && <li>• At least 3 photos ({photos.length}/3)</li>}
              {!name.trim() && <li>• Dog&apos;s name</li>}
              {!breed.trim() && <li>• Breed</li>}
              {!age && <li>• Age</li>}
              {!sex && <li>• Sex</li>}
              {!size && <li>• Size</li>}
              {energySource === 'none' && <li>• Energy level (pick a personality tag or drag the slider)</li>}
              {(temperament.length === 0 && playStyles.length === 0) && (
                <li>• At least one temperament or play style</li>
              )}
              {!zip.trim() && !(city.trim() && usState.trim()) && <li>• ZIP code or city + state</li>}
            </ul>
          </div>
        )}

        {submitError && (
          <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
            {submitError} If it keeps failing, remove that photo and pick another.
          </p>
        )}

        <button
          type="submit"
          disabled={isBusy}
          className="btn-primary py-4 disabled:opacity-40"
        >
          {uploading
            ? 'Uploading photos…'
            : saving
            ? 'Saving…'
            : complete
            ? 'Save & Start Swiping 🐾'
            : 'Save Profile'}
        </button>
        <p className="-mt-2 text-center text-xs font-semibold text-brown">
          {complete
            ? 'You can edit any of this later.'
            : 'Add the items above to save your profile and start matching.'}
        </p>
      </form>
    </div>
  );
}
