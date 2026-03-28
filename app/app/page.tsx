'use client';
import { useState, useEffect, useMemo } from 'react';
import { SEED_DOGS } from '../../../shared/data/seedDogs';
import { calculateCompatibility } from '../../../shared/utils/matchingEngine';
import {
  signInWithGoogle, signOutUser,
  getUserDogProfile, saveUserDogProfile,
  toFullProfile, onAuthStateChanged,
} from '../../lib/auth';

import { getFirebase } from '../../../shared/utils/firebase';
import type { User, SavedDogProfile } from '../../lib/auth';
import type { DogProfile } from '../../../shared/types';
import DogProfileForm from '../../components/DogProfileForm';

const USER_DOG = SEED_DOGS[0];
const FEED = SEED_DOGS.slice(1).map((dog, i) => ({
  ...dog,
  distanceMiles: +(0.5 + i * 0.4).toFixed(1),
  compat: calculateCompatibility(USER_DOG, dog, 0.5 + i * 0.4),
}));

const DEMO_MATCH_NAMES = ['Mochi', 'Biscuit', 'Poppy', 'Theo'] as const;
const DEMO_MATCH_META: Record<string, { score: number; chatUnlocked: boolean; distanceMiles: number }> = {
  Mochi:   { score: 92, chatUnlocked: true,  distanceMiles: 0.6 },
  Biscuit: { score: 87, chatUnlocked: true,  distanceMiles: 1.2 },
  Poppy:   { score: 79, chatUnlocked: false, distanceMiles: 0.9 },
  Theo:    { score: 83, chatUnlocked: false, distanceMiles: 1.8 },
};
const DEMO_MATCHES = DEMO_MATCH_NAMES
  .map((name) => SEED_DOGS.find((d) => d.name === name))
  .filter((d): d is (typeof SEED_DOGS)[number] => d !== undefined)
  .map((dog) => ({
    ...dog,
    ...DEMO_MATCH_META[dog.name],
    messages: [] as { text: string; fromMe: boolean }[],
  }));

const SMART_PROMPTS = [
  'Park tomorrow? 🌳',
  'Morning fetch session? 🎾',
  'Short intro walk? 🐾',
  'Dog beach Saturday? 🏖️',
];

type Tab = 'discover' | 'matches';
type MatchView = 'list' | 'chat' | 'rate';

export default function AppPage() {
  const [tab, setTab] = useState<Tab>('discover');
  const [cardIndex, setCardIndex] = useState(0);
  const [likedIds, setLikedIds] = useState<Set<string>>(new Set());
  const [matchedDog, setMatchedDog] = useState<(typeof FEED)[0] | null>(null);
  const [dragX, setDragX] = useState(0);
  const [isDragging, setIsDragging] = useState(false);

  const [matchView, setMatchView] = useState<MatchView>('list');
  const [activeMatchId, setActiveMatchId] = useState<string | null>(null);
  const [chatMessages, setChatMessages] = useState<Record<string, { text: string; fromMe: boolean }[]>>({});
  const [chatInput, setChatInput] = useState('');
  const [rating, setRating] = useState(0);
  const [ratingTags, setRatingTags] = useState<string[]>([]);
  const [wouldMeetAgain, setWouldMeetAgain] = useState<boolean | null>(null);
  const [ratedIds, setRatedIds] = useState<Set<string>>(new Set());
  const [unlockedIds, setUnlockedIds] = useState<Set<string>>(new Set(['dog_2', 'dog_3']));

  // ── Auth state ──────────────────────────────────────────────────────────────
  const [authUser, setAuthUser]           = useState<User | null>(null);
  const [authLoading, setAuthLoading]     = useState(true);
  const [userDog, setUserDog]             = useState<DogProfile | null>(null);
  const [showProfileForm, setShowProfileForm] = useState(false);
  const [profileSaving, setProfileSaving] = useState(false);

  useEffect(() => {
    const { auth } = getFirebase();
    const unsub = onAuthStateChanged(auth, (user) => {
      setAuthUser(user);
      if (user) {
        getUserDogProfile(user.uid)
          .then((saved) => {
            if (saved) {
              setUserDog(toFullProfile(saved, user.uid));
            } else {
              setShowProfileForm(true);
            }
          })
          .catch(() => {/* Firestore unavailable — stay in demo mode */})
          .finally(() => setAuthLoading(false));
      } else {
        setAuthLoading(false);
      }
    });
    return unsub;
  }, []);

  async function handleProfileSaved(saved: SavedDogProfile) {
    if (!authUser) return;
    // Ensure playStyles is always a valid array before saving
    const safeProfile: SavedDogProfile = {
      ...saved,
      playStyles: Array.isArray(saved.playStyles) ? saved.playStyles : [],
    };
    setProfileSaving(true);
    try {
      await saveUserDogProfile(authUser.uid, safeProfile);
      setUserDog(toFullProfile(safeProfile, authUser.uid));
      setShowProfileForm(false);
    } catch (err) {
      console.error('Failed to save dog profile to Firestore:', err);
      // Apply locally so the user can still use the app even if Firestore write fails
      setUserDog(toFullProfile(safeProfile, authUser.uid));
      setShowProfileForm(false);
    } finally {
      setProfileSaving(false);
    }
  }

  // ── Active dog + feed (falls back to demo when not signed in) ──────────────
  const activeDog = userDog ?? USER_DOG;
  const activeFeed = useMemo(() => {
    if (!userDog) return FEED;
    return SEED_DOGS.slice(1).map((dog, i) => ({
      ...dog,
      distanceMiles: +(0.5 + i * 0.4).toFixed(1),
      compat: calculateCompatibility(userDog, dog, 0.5 + i * 0.4),
    }));
  }, [userDog]);

  const currentCard = activeFeed[cardIndex];
  const activeMatch = DEMO_MATCHES.find((m) => m.id === activeMatchId);

  function handleLike() {
    if (!currentCard) return;
    const isMatch = Math.random() > 0.38;
    if (isMatch) {
      setMatchedDog(currentCard);
    } else {
      setCardIndex((i) => i + 1);
    }
    setLikedIds((s) => new Set([...s, currentCard.id]));
  }
  function handlePass() {
    setCardIndex((i) => i + 1);
  }
  function continueAfterMatch() {
    setMatchedDog(null);
    setCardIndex((i) => i + 1);
  }

  function sendMessage(text: string) {
    if (!text.trim() || !activeMatchId) return;
    setChatMessages((prev) => ({
      ...prev,
      [activeMatchId]: [...(prev[activeMatchId] ?? [{ text: `Hi! ${activeMatch?.name} wants to meet your pup 🐾`, fromMe: false }]), { text, fromMe: true }],
    }));
    setChatInput('');
    setTimeout(() => {
      setChatMessages((prev) => ({
        ...prev,
        [activeMatchId]: [...(prev[activeMatchId] ?? []), { text: 'Sounds great! Looking forward to it! 🎉', fromMe: false }],
      }));
    }, 900);
  }

  function openChat(id: string) {
    setActiveMatchId(id);
    if (!chatMessages[id]) {
      const dog = DEMO_MATCHES.find((m) => m.id === id);
      setChatMessages((prev) => ({ ...prev, [id]: [{ text: `Hi! ${dog?.name} would love to meet your pup 🐾`, fromMe: false }] }));
    }
    setMatchView('chat');
  }

  function openRate(id: string) {
    setActiveMatchId(id);
    setRating(0);
    setRatingTags([]);
    setWouldMeetAgain(null);
    setMatchView('rate');
  }

  function submitRating() {
    if (activeMatchId) setRatedIds((s) => new Set([...s, activeMatchId]));
    setMatchView('list');
  }

  function unlockChat(id: string) {
    // In production this triggers Stripe
    setUnlockedIds((s) => new Set([...s, id]));
  }

  const RATE_TAGS = ['Friendly 😊', 'Too rough ⚠️', 'Great match 💛', 'Slow intro needed 🐾'];

  return (
    <div className="min-h-screen bg-cream flex flex-col max-w-md mx-auto shadow-2xl relative">
      {/* Top Nav */}
      <header className="sticky top-0 z-40 bg-white/90 backdrop-blur border-b border-border px-5 h-14 flex items-center justify-between">
        <span className="font-display text-xl text-brown">🐾 GoDoggyDate</span>
        {!authLoading && (
          authUser ? (
            <div className="flex items-center gap-2">
              <span className="text-xs text-brown-light font-body">Hi, {activeDog.name}&apos;s owner 👋</span>
              <button
                onClick={signOutUser}
                className="text-xs text-brown-light hover:text-primary transition-colors"
              >
                Sign out
              </button>
            </div>
          ) : (
            <button
              onClick={() => signInWithGoogle().catch(() => {})}
              className="text-xs bg-primary/10 text-primary font-semibold rounded-full px-3 py-1 hover:bg-primary/20 transition-colors"
            >
              Sign in 🐾
            </button>
          )
        )}
      </header>

      {/* Profile setup overlay — shown to new users after sign-in */}
      {showProfileForm && authUser && (
        <div className="absolute inset-0 z-30 bg-cream overflow-y-auto pb-20">
          <DogProfileForm onSaved={handleProfileSaved} saving={profileSaving} />
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto pb-20">

        {/* ── DISCOVER ── */}
        {tab === 'discover' && !matchedDog && (
          <div className="p-4">
            <div className="flex items-center justify-between mb-3">
              <p className="font-display text-2xl text-brown">Discover 🐾</p>
              <p className="text-xs text-brown-light">{activeFeed.length - cardIndex} dogs nearby</p>
            </div>

            {!currentCard ? (
              <div className="flex flex-col items-center justify-center py-24 gap-4 text-center">
                <span className="text-6xl">🐾</span>
                <p className="font-display text-2xl text-brown">You've seen everyone nearby!</p>
                <p className="text-brown-light text-sm">Check back soon for new dogs.</p>
              </div>
            ) : (
              <>
                {/* Card Stack */}
                <div className="relative flex justify-center mb-4" style={{ height: 460 }}>
                  {/* Back card */}
                  {activeFeed[cardIndex + 1] && (
                    <div
                      className="absolute inset-x-0 rounded-3xl overflow-hidden bg-cream-dark"
                      style={{ top: 12, bottom: -12, transform: 'scale(0.96)', opacity: 0.7 }}
                    />
                  )}
                  {/* Front card */}
                  <div
                    className="absolute inset-0 rounded-3xl overflow-hidden shadow-xl cursor-grab active:cursor-grabbing select-none"
                    style={{
                      transform: `rotate(${dragX * 0.04}deg) translateX(${dragX * 0.3}px)`,
                      transition: isDragging ? 'none' : 'transform 0.3s ease',
                    }}
                    onMouseDown={(e) => { setIsDragging(true); const start = e.clientX; const move = (ev: MouseEvent) => setDragX(ev.clientX - start); const up = () => { setIsDragging(false); if (Math.abs(dragX) > 80) { dragX > 0 ? handleLike() : handlePass(); } setDragX(0); window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); }; window.addEventListener('mousemove', move); window.addEventListener('mouseup', up); }}
                  >
                    {/* Photo */}
                    <div className="h-64 bg-gradient-to-br from-gold to-primary flex items-center justify-center relative">
                      <span className="text-9xl">🐕</span>
                      {/* Swipe overlays */}
                      {dragX > 40 && (
                        <div className="absolute top-6 right-6 border-4 border-gold rounded-xl px-3 py-1 rotate-12">
                          <span className="font-display text-white text-xl">WOOF! 🐾</span>
                        </div>
                      )}
                      {dragX < -40 && (
                        <div className="absolute top-6 left-6 border-4 border-red-400 rounded-xl px-3 py-1 -rotate-12">
                          <span className="font-display text-white text-xl">PASS</span>
                        </div>
                      )}
                    </div>
                    {/* Info */}
                    <div className="p-4 bg-white">
                      <div className="flex items-start gap-3 mb-3">
                        <div className="score-ring w-12 h-12 text-sm shrink-0">{currentCard.compat.score}</div>
                        <div>
                          <p className="font-display text-xl text-brown">{currentCard.name}, {currentCard.age}</p>
                          <p className="text-sm text-brown-light">{currentCard.breed} · {currentCard.distanceMiles} mi away</p>
                        </div>
                        {currentCard.vaccinated === true && (
                          <span className="ml-auto text-xs bg-green-50 text-green-700 border border-green-200 rounded-full px-2 py-1">✅ Vaccinated</span>
                        )}
                      </div>

                      {/* Match quality badge */}
                      <div className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold mb-2 border ${
                        currentCard.compat.quality === 'perfect'
                          ? 'bg-green-50 text-green-700 border-green-200'
                          : currentCard.compat.quality === 'blocked'
                          ? 'bg-red-50 text-red-600 border-red-200'
                          : 'bg-amber-50 text-amber-700 border-amber-200'
                      }`}>
                        {currentCard.compat.quality === 'perfect' ? '🟢' : currentCard.compat.quality === 'blocked' ? '🔴' : '🟡'}
                        {currentCard.compat.label}
                      </div>

                      {/* Chips */}
                      <div className="flex flex-wrap gap-1.5 mb-2">
                        <span className="chip text-xs">⚡ {currentCard.energyLevel}% energy</span>
                        <span className="chip text-xs">{currentCard.size} size</span>
                        {(currentCard.playStyles ?? []).slice(0, 2).map((ps) => (
                          <span key={ps} className="chip text-xs">🎾 {ps}</span>
                        ))}
                      </div>

                      {/* Why this match works */}
                      {currentCard.compat.reasons.length > 0 && (
                        <div className="flex flex-col gap-0.5 mb-1.5">
                          {currentCard.compat.reasons.map((r) => (
                            <p key={r} className="text-xs text-brown-light">✔ {r}</p>
                          ))}
                        </div>
                      )}

                      {/* Microcopy */}
                      <p className={`text-xs font-medium mt-1 ${
                        currentCard.compat.quality === 'perfect' ? 'text-green-700'
                        : currentCard.compat.quality === 'blocked' ? 'text-red-600'
                        : 'text-amber-700'
                      }`}>{currentCard.compat.microcopy}</p>
                    </div>
                  </div>
                </div>

                {/* Buttons */}
                <div className="flex justify-center gap-5 mt-2">
                  <button onClick={handlePass} className="w-16 h-16 rounded-full bg-white shadow-lg flex items-center justify-center text-2xl hover:scale-105 transition-transform border border-border">✕</button>
                  <button className="w-12 h-12 rounded-full bg-gold shadow-md flex items-center justify-center text-xl hover:scale-105 transition-transform self-center">⭐</button>
                  <button onClick={handleLike} className="w-16 h-16 rounded-full bg-primary shadow-lg flex items-center justify-center text-2xl hover:scale-105 transition-transform">🐾</button>
                </div>
              </>
            )}
          </div>
        )}

        {/* ── MATCH CELEBRATION ── */}
        {tab === 'discover' && matchedDog && (
          <div className="flex flex-col items-center justify-center min-h-[80vh] px-8 text-center gap-5 bg-gradient-to-b from-brown to-primary-dark">
            <div className="text-7xl animate-bounce">🐕 💛 🐶</div>
            <h2 className="font-display text-5xl text-white">It's a Match!</h2>
            <p className="text-white/80 text-lg">You and {matchedDog.name} could be perfect playdate buddies!</p>
            <div className="score-ring w-16 h-16 text-xl">{matchedDog.compat.score}</div>
            <button
              onClick={() => { unlockChat(matchedDog.id); continueAfterMatch(); setTab('matches'); }}
              className="bg-gold text-brown font-bold rounded-full px-8 py-4 text-lg shadow-xl hover:scale-105 transition-transform"
            >
              💬 Unlock Chat · $4.99
            </button>
            <button onClick={continueAfterMatch} className="text-white/60 text-sm hover:text-white/90 transition-colors">
              Keep swiping →
            </button>
          </div>
        )}

        {/* ── MATCHES ── */}
        {tab === 'matches' && matchView === 'list' && (
          <div className="p-4">
            <p className="font-display text-2xl text-brown mb-4">💛 Matches</p>
            <div className="flex flex-col gap-3">
              {DEMO_MATCHES.map((m) => (
                <div key={m.id} className="card rounded-2xl flex items-center overflow-hidden">
                  <div className="w-20 h-20 bg-gradient-to-br from-gold to-primary flex items-center justify-center shrink-0">
                    <span className="text-4xl">🐕</span>
                  </div>
                  <div className="flex-1 px-3 py-2">
                    <p className="font-bold text-brown text-base">{m.name}</p>
                    <p className="text-xs text-brown-light">{m.breed}</p>
                    <div className="flex gap-2 mt-1">
                      <span className="text-xs font-semibold text-primary">{m.score}% match</span>
                      <span className="text-xs text-brown-light">📍 {m.distanceMiles} mi</span>
                    </div>
                  </div>
                  <div className="flex gap-2 pr-3">
                    {unlockedIds.has(m.id) || m.chatUnlocked ? (
                      <>
                        <button onClick={() => openChat(m.id)} className="w-10 h-10 rounded-full bg-primary flex items-center justify-center text-lg hover:scale-105 transition-transform">💬</button>
                        {!ratedIds.has(m.id) && (
                          <button onClick={() => openRate(m.id)} className="w-10 h-10 rounded-full bg-gold flex items-center justify-center text-lg hover:scale-105 transition-transform">⭐</button>
                        )}
                      </>
                    ) : (
                      <button onClick={() => unlockChat(m.id)} className="bg-gold text-brown font-bold rounded-full px-3 py-1.5 text-xs hover:scale-105 transition-transform">🔓 $4.99</button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── CHAT ── */}
        {tab === 'matches' && matchView === 'chat' && activeMatch && (
          <div className="flex flex-col h-[calc(100vh-7rem)]">
            <div className="flex items-center gap-3 px-4 py-3 bg-white border-b border-border">
              <button onClick={() => setMatchView('list')} className="text-2xl text-brown-light hover:text-brown">←</button>
              <span className="font-bold text-brown flex-1">{activeMatch.name}</span>
              <button onClick={() => openRate(activeMatch.id)} className="text-xs bg-gold/20 text-brown-mid font-semibold rounded-full px-3 py-1.5">Rate ⭐</button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-2 bg-cream">
              {(chatMessages[activeMatch.id] ?? []).map((msg, i) => (
                <div key={i} className={`max-w-[75%] rounded-2xl px-4 py-2.5 text-sm ${msg.fromMe ? 'self-end bg-primary text-white' : 'self-start bg-white text-brown shadow-sm'}`}>
                  {msg.text}
                </div>
              ))}
            </div>
            <div className="overflow-x-auto flex gap-2 px-4 py-2 bg-white border-t border-border">
              {SMART_PROMPTS.map((p) => (
                <button key={p} onClick={() => sendMessage(p)} className="shrink-0 bg-primary/10 text-primary font-semibold text-xs rounded-full px-3 py-1.5 hover:bg-primary/20 transition-colors">{p}</button>
              ))}
            </div>
            <div className="flex gap-2 px-4 py-3 bg-white border-t border-border">
              <input
                className="flex-1 bg-cream rounded-full px-4 py-2.5 text-sm text-brown placeholder:text-brown-light outline-none"
                placeholder="Type a message..."
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && sendMessage(chatInput)}
              />
              <button onClick={() => sendMessage(chatInput)} className="w-10 h-10 rounded-full bg-primary text-white flex items-center justify-center hover:scale-105 transition-transform">➤</button>
            </div>
          </div>
        )}

        {/* ── RATE ── */}
        {tab === 'matches' && matchView === 'rate' && activeMatch && (
          <div className="p-6">
            <div className="flex items-center gap-3 mb-6">
              <button onClick={() => setMatchView('chat')} className="text-2xl text-brown-light">←</button>
              <p className="font-display text-2xl text-brown">Rate Playdate ⭐</p>
            </div>
            <p className="text-brown-mid mb-5">How was your playdate with {activeMatch.name}?</p>
            <div className="flex gap-2 mb-6">
              {[1,2,3,4,5].map((s) => (
                <button key={s} onClick={() => setRating(s)} className={`text-5xl transition-transform hover:scale-110 ${s <= rating ? 'text-gold' : 'text-border'}`}>★</button>
              ))}
            </div>
            <p className="text-sm font-semibold text-brown-mid mb-3">Would you meet again?</p>
            <div className="flex gap-3 mb-6">
              {[true, false].map((v) => (
                <button key={String(v)} onClick={() => setWouldMeetAgain(v)}
                  className={`flex-1 py-3 rounded-xl border-2 font-semibold text-sm transition-colors ${wouldMeetAgain === v ? (v ? 'border-primary bg-primary/10 text-primary' : 'border-amber-400 bg-amber-50 text-amber-700') : 'border-border bg-white text-brown-mid'}`}
                >
                  {v ? '🐾 Yes!' : 'Not this time'}
                </button>
              ))}
            </div>
            <p className="text-sm font-semibold text-brown-mid mb-3">How was the vibe?</p>
            <div className="flex flex-wrap gap-2 mb-8">
              {RATE_TAGS.map((tag) => (
                <button key={tag} onClick={() => setRatingTags((p) => p.includes(tag) ? p.filter((t) => t !== tag) : [...p, tag])}
                  className={`chip ${ratingTags.includes(tag) ? 'chip-active' : ''}`}
                >
                  {tag}
                </button>
              ))}
            </div>
            <button onClick={submitRating} disabled={rating === 0}
              className="w-full btn-primary py-4 disabled:opacity-40">
              Submit Rating ⭐
            </button>
          </div>
        )}
      </div>

      {/* Bottom Tab Bar */}
      <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md bg-white border-t border-border flex">
        {(['discover', 'matches'] as Tab[]).map((t) => (
          <button key={t} onClick={() => { setTab(t); if (t === 'matches') setMatchView('list'); }}
            className={`flex-1 py-3 flex flex-col items-center gap-0.5 transition-colors ${tab === t ? 'text-primary' : 'text-brown-light'}`}
          >
            <span className="text-2xl">{t === 'discover' ? '🐾' : '💛'}</span>
            <span className="text-[10px] font-semibold capitalize">{t}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}
