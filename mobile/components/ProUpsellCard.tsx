// mobile/components/ProUpsellCard.tsx
// The goDoggyDate Pro surface — mirrors web/components/ProUpsellCard.tsx.
// Shows Pro's value and (when configured) starts a monthly/annual checkout in
// the external browser, or — for an existing subscriber — a "manage plan" link
// to the Stripe billing portal. Founding Members see a grandfathered "Pro for
// life" state and no upsell.
//
// Honesty: the benefit list only names what Pro actually does now; anything not
// yet shipped is explicitly framed as "coming to Pro", never claimed as live.
// The live checkout is env-gated (isProConfigured) so nothing half-works.

import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, fonts, radius } from '../constants/theme';
import { startProCheckout, openProPortal, isProConfigured, canOfferInAppPurchase } from '../lib/pro';
import { trackEvent } from '../lib/analytics';
import {
  proMonthlyLabel,
  proAnnualLabel,
  proAnnualPerMonthLabel,
  proAnnualSavingsPercent,
  PRO_TRIAL_DAYS,
  type ProTier,
  type ProSource,
} from '../../shared/pro';

interface Props {
  isPro: boolean;
  isFounding: boolean;
  source: ProSource;
}

// The ONE genuinely live, Pro-exclusive benefit today. Deliberately not padded
// with things free users already get, or things not yet built.
const LIVE_BENEFIT = '💭  A new Pet Twin card from your dog every day — free gets one a week';
const COMING_BENEFITS =
  'And first access as they land: your dog’s saved story (Year in Dog), life-stage checklists, and the Legacy Vault.';

export default function ProUpsellCard({ isPro, isFounding, source }: Props) {
  const [tier, setTier] = useState<ProTier>('annual');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const configured = isProConfigured();

  async function handleSubscribe() {
    if (busy) return;
    setBusy(true);
    setError(null);
    trackEvent('pro_checkout_click', { tier });
    try {
      await startProCheckout(tier);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start checkout.');
    } finally {
      setBusy(false);
    }
  }

  async function handleManage() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await openProPortal();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not open billing.');
    } finally {
      setBusy(false);
    }
  }

  // ── Founding Member: grandfathered Pro for life ──────────────────────────
  if (isPro && (isFounding || source === 'founding')) {
    return (
      <View style={[styles.card, styles.foundingCard]}>
        <Text style={styles.foundingTitle}>⭐ Founding Member — Pro for life</Text>
        <Text style={styles.foundingBody}>
          You were here first, so Pro is yours forever — daily Pet Twin cards and everything we add to Pro.
          Thank you for backing this early.
        </Text>
      </View>
    );
  }

  // ── Active subscriber: manage plan ───────────────────────────────────────
  if (isPro && source === 'subscription') {
    return (
      <View style={[styles.card, styles.activeCard]}>
        <Text style={styles.activeTitle}>🐾 goDoggyDate Pro — active</Text>
        <Text style={styles.activeBody}>
          Thanks for going Pro. A new Pet Twin card from your dog every day, and first access to everything we
          add to Pro.
        </Text>
        {error && <Text style={styles.error}>{error}</Text>}
        <Pressable style={[styles.manageButton, busy && { opacity: 0.6 }]} onPress={handleManage} disabled={busy}>
          <Text style={styles.manageText}>{busy ? 'Opening…' : 'Manage plan'}</Text>
        </Pressable>
      </View>
    );
  }

  // ── Upsell ───────────────────────────────────────────────────────────────
  const savings = proAnnualSavingsPercent();

  return (
    <View style={[styles.card, styles.upsellCard]}>
      <View style={styles.upsellHeader}>
        <Text style={styles.upsellEyebrow}>goDoggyDate Pro</Text>
        <Text style={styles.upsellTitle}>Your dog’s whole life, in one place</Text>
      </View>

      <View style={styles.upsellBody}>
        <Text style={styles.benefit}>{LIVE_BENEFIT}</Text>
        <Text style={styles.coming}>{COMING_BENEFITS}</Text>

        {!configured ? (
          <View style={styles.comingSoon}>
            <Text style={styles.comingSoonTitle}>Coming soon 🐾</Text>
            <Text style={styles.comingSoonBody}>
              Pro is almost ready. Keep enjoying Dogtype, life stage, and your weekly Pet Twin card — free.
            </Text>
          </View>
        ) : !canOfferInAppPurchase() ? (
          // iOS: no in-app digital-goods sale (Guideline 3.1.1). Informational,
          // no purchase button and no steering link.
          <View style={styles.comingSoon}>
            <Text style={styles.comingSoonTitle}>Pro is managed on the web 🐾</Text>
            <Text style={styles.comingSoonBody}>
              Your dog’s Dogtype, life stage, and a weekly Pet Twin card are free right here. Pro membership
              is handled on the goDoggyDate website.
            </Text>
          </View>
        ) : (
          <>
            {/* Monthly / annual toggle */}
            <View style={styles.tierRow}>
              <Pressable
                style={[styles.tierOption, tier === 'monthly' && styles.tierOptionActive]}
                onPress={() => setTier('monthly')}
              >
                <Text style={styles.tierPrice}>{proMonthlyLabel()}</Text>
                <Text style={styles.tierSub}>billed monthly</Text>
              </Pressable>
              <Pressable
                style={[styles.tierOption, tier === 'annual' && styles.tierOptionActive]}
                onPress={() => setTier('annual')}
              >
                {savings > 0 && (
                  <View style={styles.saveBadge}>
                    <Text style={styles.saveBadgeText}>save {savings}%</Text>
                  </View>
                )}
                <Text style={styles.tierPrice}>{proAnnualLabel()}</Text>
                <Text style={styles.tierSub}>{proAnnualPerMonthLabel()}</Text>
              </Pressable>
            </View>

            {error && <Text style={styles.error}>{error}</Text>}

            <Pressable style={[styles.ctaButton, busy && { opacity: 0.6 }]} onPress={handleSubscribe} disabled={busy}>
              {busy ? (
                <ActivityIndicator color={colors.white} />
              ) : (
                <Text style={styles.ctaText}>
                  {PRO_TRIAL_DAYS > 0 ? `Start ${PRO_TRIAL_DAYS}-day free trial` : 'Go Pro'}
                </Text>
              )}
            </Pressable>
            {/* Scoped to "new members": the server grants the trial only to
                customers who never subscribed (checkout route: !existingCustomerId),
                so a returning/churned member is billed immediately. Stripe
                Checkout shows each user their true terms before they pay. */}
            <Text style={styles.fineprint}>
              {PRO_TRIAL_DAYS > 0 ? `New members get ${PRO_TRIAL_DAYS} days free, then ` : ''}
              {tier === 'annual' ? proAnnualLabel() : proMonthlyLabel()}. Cancel anytime.
            </Text>
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radius.xl, overflow: 'hidden', marginBottom: 16 },
  error: { fontFamily: fonts.body, fontSize: 12, color: colors.danger, marginTop: 8 },

  foundingCard: {
    borderWidth: 1,
    borderColor: `${colors.gold}66`,
    backgroundColor: `${colors.gold}1A`,
    paddingHorizontal: 18,
    paddingVertical: 16,
  },
  foundingTitle: { fontFamily: fonts.bold, fontSize: 14, color: colors.brown },
  foundingBody: { fontFamily: fonts.body, fontSize: 12, color: colors.brownLight, lineHeight: 18, marginTop: 4 },

  activeCard: {
    borderWidth: 1,
    borderColor: `${colors.primary}4D`,
    backgroundColor: `${colors.primary}0D`,
    paddingHorizontal: 18,
    paddingVertical: 16,
  },
  activeTitle: { fontFamily: fonts.bold, fontSize: 14, color: colors.brown },
  activeBody: { fontFamily: fonts.body, fontSize: 12, color: colors.brownLight, lineHeight: 18, marginTop: 4 },
  manageButton: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
    borderRadius: radius.full,
    paddingVertical: 11,
    alignItems: 'center',
    marginTop: 12,
  },
  manageText: { fontFamily: fonts.semibold, fontSize: 14, color: colors.brown },

  upsellCard: { borderWidth: 1, borderColor: `${colors.primary}4D`, backgroundColor: colors.white },
  upsellHeader: { backgroundColor: `${colors.primary}14`, paddingHorizontal: 18, paddingVertical: 14 },
  upsellEyebrow: {
    fontFamily: fonts.bold,
    fontSize: 11,
    color: colors.primary,
    textTransform: 'uppercase',
    letterSpacing: 1.6,
  },
  upsellTitle: { fontFamily: fonts.display, fontSize: 20, color: colors.brown, marginTop: 2 },
  upsellBody: { paddingHorizontal: 18, paddingVertical: 16 },
  benefit: { fontFamily: fonts.semibold, fontSize: 14, color: colors.brownMid, lineHeight: 20 },
  coming: { fontFamily: fonts.body, fontSize: 11, color: colors.brownLight, lineHeight: 16, marginTop: 8 },
  comingSoon: {
    marginTop: 16,
    borderRadius: radius.md,
    backgroundColor: colors.creamDark,
    paddingHorizontal: 16,
    paddingVertical: 14,
    alignItems: 'center',
  },
  comingSoonTitle: { fontFamily: fonts.bold, fontSize: 14, color: colors.brown },
  comingSoonBody: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.brownLight,
    lineHeight: 17,
    marginTop: 2,
    textAlign: 'center',
  },
  tierRow: { flexDirection: 'row', gap: 8, marginTop: 16 },
  tierOption: {
    flex: 1,
    borderWidth: 2,
    borderColor: colors.border,
    backgroundColor: colors.white,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    alignItems: 'center',
  },
  tierOptionActive: { borderColor: colors.primary, backgroundColor: `${colors.primary}14` },
  tierPrice: { fontFamily: fonts.bold, fontSize: 14, color: colors.brown },
  tierSub: { fontFamily: fonts.body, fontSize: 10, color: colors.brownLight, marginTop: 1 },
  saveBadge: {
    position: 'absolute',
    top: -9,
    right: 8,
    backgroundColor: colors.gold,
    borderRadius: radius.full,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  saveBadgeText: { fontFamily: fonts.bold, fontSize: 9, color: colors.brown },
  ctaButton: {
    backgroundColor: colors.primary,
    borderRadius: radius.full,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 12,
  },
  ctaText: { fontFamily: fonts.bold, fontSize: 15, color: colors.white },
  fineprint: { fontFamily: fonts.body, fontSize: 11, color: colors.brownLight, textAlign: 'center', marginTop: 8 },
});
