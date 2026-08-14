'use client';
// web/lib/useProEntitlement.ts
// One hook every surface uses to ask "is this user Pro right now?" — backed by
// the realtime entitlements listener, so a successful checkout flips the UI the
// instant the webhook writes the grant (no reload). The gate is still enforced
// server-side in the AI routes; this is only for showing/hiding UI.

import { useEffect, useState } from 'react';
import { onEntitlements, isProActive, isFoundingMember, proSource } from './entitlements';
import type { Entitlements, ProSource } from '../../shared/pro';
import { NO_ENTITLEMENTS } from '../../shared/pro';

export interface ProState {
  entitlements: Entitlements;
  /** Full Pro access (an active subscription OR a lifetime Founding Member). */
  isPro: boolean;
  isFounding: boolean;
  source: ProSource;
  /** true until the first entitlements snapshot lands — avoids flashing a
   *  paywall at a subscriber on first paint. */
  loading: boolean;
}

const INITIAL: ProState = {
  entitlements: NO_ENTITLEMENTS,
  isPro: false,
  isFounding: false,
  source: null,
  loading: true,
};

export function useProEntitlement(userId: string | null | undefined): ProState {
  const [state, setState] = useState<ProState>(INITIAL);

  useEffect(() => {
    if (!userId) {
      setState({ ...INITIAL, loading: false });
      return;
    }
    setState((prev) => ({ ...prev, loading: true }));
    return onEntitlements(userId, (entitlements) => {
      setState({
        entitlements,
        isPro: isProActive(entitlements),
        isFounding: isFoundingMember(entitlements),
        source: proSource(entitlements),
        loading: false,
      });
    });
  }, [userId]);

  return state;
}
