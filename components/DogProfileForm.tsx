'use client';
// web/components/DogProfileForm.tsx
// Minimal dog profile creation form. Reuses existing .chip / .btn-primary styles.

import { useState } from 'react';
import type { SavedDogProfile } from '../lib/auth';

const SIZES: { value: 'S' | 'M' | 'L' | 'XL'; label: string }[] = [
  { value: 'S',  label: 'Small' },
  { value: 'M',  label: 'Medium' },
  { value: 'L',  label: 'Large' },
  { value: 'XL', label: 'XL' },
];

const PLAY_STYLE_OPTIONS = [
  'loves fetch 🎾',
  'wrestling 🤼',
  'gentle play 🐾',
  'high-energy runner ⚡',
  'calm 🧘',
  'explorer 👃',
];

interface Props {
  onSaved: (profile: SavedDogProfile) => void;
  saving: boolean;
}

export default function DogProfileForm({ onSaved, saving }: Props) {
  const [name, setName]               = useState('');
  const [size, setSize]               = useState<'S' | 'M' | 'L' | 'XL'>('M');
  const [energyLevel, setEnergyLevel] = useState(60);
  const [playStyles, setPlayStyles]   = useState<string[]>([]);
  const [vaccinated, setVaccinated]   = useState(true);

  function toggleStyle(s: string) {
    setPlayStyles((p) => (p.includes(s) ? p.filter((x) => x !== s) : [...p, s]));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    onSaved({ name: name.trim(), size, energyLevel, playStyles, vaccinated });
  }

  return (
    <div className="flex flex-col items-center justify-start px-6 py-8 min-h-[80vh]">
      <p className="text-4xl mb-3">🐾</p>
      <h2 className="font-display text-3xl text-brown mb-1">Set up your dog's profile</h2>
      <p className="text-brown-light text-sm mb-7 text-center">
        Helps us find the right matches for your pup.
      </p>

      <form onSubmit={handleSubmit} className="w-full max-w-sm flex flex-col gap-5">
        {/* Name */}
        <div>
          <label className="text-sm font-semibold text-brown-mid block mb-1.5">
            Dog's name
          </label>
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Kaju"
            className="w-full bg-white border border-border rounded-xl px-4 py-2.5 text-brown text-sm outline-none focus:border-primary transition-colors"
          />
        </div>

        {/* Size */}
        <div>
          <label className="text-sm font-semibold text-brown-mid block mb-1.5">Size</label>
          <div className="flex gap-2">
            {SIZES.map((s) => (
              <button
                key={s.value}
                type="button"
                onClick={() => setSize(s.value)}
                className={`chip flex-1 justify-center text-xs ${size === s.value ? 'chip-active' : ''}`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        {/* Energy level */}
        <div>
          <label className="text-sm font-semibold text-brown-mid block mb-1.5">
            Energy level{' '}
            <span className="text-primary font-bold">{energyLevel}%</span>
          </label>
          <input
            type="range"
            min={10}
            max={100}
            step={5}
            value={energyLevel}
            onChange={(e) => setEnergyLevel(Number(e.target.value))}
            className="w-full accent-primary"
          />
          <div className="flex justify-between text-xs text-brown-light mt-1">
            <span>Chill 🧘</span>
            <span>Energetic ⚡</span>
          </div>
        </div>

        {/* Play styles */}
        <div>
          <label className="text-sm font-semibold text-brown-mid block mb-1.5">
            Play style <span className="font-normal text-brown-light">(pick any)</span>
          </label>
          <div className="flex flex-wrap gap-2">
            {PLAY_STYLE_OPTIONS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => toggleStyle(s)}
                className={`chip text-xs ${playStyles.includes(s) ? 'chip-active' : ''}`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        {/* Vaccinated */}
        <div>
          <label className="text-sm font-semibold text-brown-mid block mb-1.5">
            Vaccination status
          </label>
          <div className="flex gap-3">
            {([true, false] as const).map((v) => (
              <button
                key={String(v)}
                type="button"
                onClick={() => setVaccinated(v)}
                className={`flex-1 py-2.5 rounded-xl border-2 font-semibold text-sm transition-colors ${
                  vaccinated === v
                    ? v
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-amber-400 bg-amber-50 text-amber-700'
                    : 'border-border bg-white text-brown-mid'
                }`}
              >
                {v ? '✅ Vaccinated' : 'Not yet'}
              </button>
            ))}
          </div>
        </div>

        <button
          type="submit"
          disabled={!name.trim() || saving}
          className="btn-primary py-4 text-base disabled:opacity-40"
        >
          {saving ? 'Saving...' : 'Save Profile 🐾'}
        </button>
      </form>
    </div>
  );
}
