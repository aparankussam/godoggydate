'use client';
// web/components/DogProfileForm.tsx
// Dog profile form — device photo upload, breed datalist, structured location.

import { useEffect, useRef, useState } from 'react';
import type { SavedDogProfile } from '../lib/auth';
import { isProfileComplete } from '../lib/auth';
import { uploadDogPhoto } from '../lib/storage';
import { getFirebase } from '../shared/utils/firebase';
import { BREEDS } from '../shared/types/breeds';

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

const DEFAULT_PROMPTS = [
  "My dog's personality in 3 words:",
  'Perfect playdate looks like:',
  'Things my dog loves:',
];

const MAX_PHOTOS = 6;
const MIN_PHOTOS = 3;

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
};

export default function DogProfileForm({ onSaved, saving, initialProfile }: Props) {
  const [name, setName] = useState('');
  const [breed, setBreed] = useState('');
  const [age, setAge] = useState<'puppy' | 'adult' | 'senior' | ''>('');
  const [sex, setSex] = useState<'M' | 'F' | ''>('');
  const [size, setSize] = useState<'S' | 'M' | 'L' | 'XL'>('M');
  const [energyLevel, setEnergyLevel] = useState(60);
  const [temperament, setTemperament] = useState<string[]>([]);
  const [playStyles, setPlayStyles] = useState<string[]>([]);
  const [zip, setZip] = useState('');
  const [city, setCity] = useState('');
  const [usState, setUsState] = useState('');
  const [vaccinated, setVaccinated] = useState(true);
  const [prompts, setPrompts] = useState(
    DEFAULT_PROMPTS.map((prompt) => ({ prompt, answer: '' })),
  );
  const [photos, setPhotos] = useState<PhotoItem[]>([]);
  const [submitted, setSubmitted] = useState(false);
  const [errors, setErrors] = useState<ValidationErrors>(EMPTY_ERRORS);
  const [uploading, setUploading] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const previewUrlsRef = useRef<string[]>([]);
  const photosRef = useRef<HTMLDivElement | null>(null);
  const nameRef = useRef<HTMLInputElement | null>(null);
  const breedRef = useRef<HTMLInputElement | null>(null);
  const ageRef = useRef<HTMLDivElement | null>(null);
  const sexRef = useRef<HTMLDivElement | null>(null);
  const sizeRef = useRef<HTMLDivElement | null>(null);
  const energyRef = useRef<HTMLInputElement | null>(null);
  const zipRef = useRef<HTMLInputElement | null>(null);
  const locationRef = useRef<HTMLInputElement | null>(null);
  const stateRef = useRef<HTMLSelectElement | null>(null);

  useEffect(() => {
    return () => {
      previewUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    };
  }, []);

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
    setVaccinated(initialProfile.vaccinated ?? true);
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

  function getValidationErrors(): ValidationErrors {
    const hasZip = !!zip.trim();
    const hasCity = !!city.trim();
    const hasState = !!usState.trim();

    return {
      photos: photos.length === 0 ? 'Add at least 1 photo' : '',
      name: !name.trim() ? 'Required' : '',
      breed: !breed.trim() ? 'Required' : '',
      age: !age ? 'Required' : '',
      sex: !sex ? 'Required' : '',
      size: !size ? 'Required' : '',
      energy: Number.isFinite(energyLevel) ? '' : 'Required',
      zip: hasZip && !/^\d{5}(-\d{4})?$/.test(zip.trim()) ? 'Enter a valid ZIP code' : '',
      city: !hasZip && !hasCity ? 'Enter a city or use ZIP' : '',
      state: !hasZip && hasCity && !hasState ? 'Select a state' : '',
      personality: temperament.length === 0 && playStyles.length === 0 ? 'Pick at least one' : '',
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

  const zipStr = zip.trim();
  const cityStr = city.trim();
  const stateStr = usState.trim();
  const locationStr = zipStr
    ? zipStr
    : cityStr && stateStr
    ? `${cityStr}, ${stateStr}`
    : '';

  const uploadedUrls = photos.map((photo) => photo.url).filter(Boolean);
  const photosForCheck = uploadedUrls.length > 0
    ? [...uploadedUrls, ...Array(Math.max(0, MIN_PHOTOS - uploadedUrls.length)).fill('_placeholder_')]
    : [];

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
        photos: photosFinal,
        location: locationStr,
        city: cityStr || undefined,
        state: stateStr || undefined,
        zip: zipStr || undefined,
        vaccinated,
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
            Photos <span className="font-normal text-brown-light">(1 required, up to {MAX_PHOTOS})</span>
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
              placeholder="City or neighbourhood"
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

        <div>
          <label className="mb-1.5 block text-sm font-semibold text-brown-mid">Vaccination status</label>
          <div className="flex gap-3">
            {([true, false] as const).map((value) => (
              <button
                key={String(value)}
                type="button"
                onClick={() => setVaccinated(value)}
                className={`flex-1 rounded-xl border-2 py-2.5 text-sm font-semibold transition-colors ${
                  vaccinated === value
                    ? value
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-amber-400 bg-amber-50 text-amber-700'
                    : 'border-border bg-white text-brown-mid'
                }`}
              >
                {value ? '✅ Vaccinated' : 'Not yet'}
              </button>
            ))}
          </div>
        </div>

        {!complete && (
          <div className="rounded-2xl bg-cream-dark px-4 py-3 text-sm text-brown-mid">
            <p className="mb-1 font-semibold">To unlock swiping, add:</p>
            <ul className="space-y-0.5 text-xs text-brown-light">
              {photos.length === 0 && <li>• At least 1 photo</li>}
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
