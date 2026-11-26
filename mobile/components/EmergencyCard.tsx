// mobile/components/EmergencyCard.tsx
// "In an emergency", in Profile > Care under the lost-dog kit: the nearest
// emergency vet (a Maps search, so it is always current and local) and the
// ASPCA Animal Poison Control line. Rarely needed, and worth everything when it
// is. Mirrors web/components/EmergencyCard.tsx.

import { Linking, Platform, Text } from 'react-native';
import { trackEvent } from '../lib/analytics';
import { EMERGENCY_VET_QUERY, POISON_HOTLINE } from '../../shared/emergency';
import { SafetyCard, safetyText } from './SafetyCard';
import { PaperButton } from './pack/kit';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { colors } from '../constants/theme';

export default function EmergencyCard() {
  const openVet = () => {
    trackEvent('emergency_click', { target: 'vet' });
    const q = encodeURIComponent(EMERGENCY_VET_QUERY);
    Linking.openURL(Platform.OS === 'ios' ? `maps://?q=${q}` : `geo:0,0?q=${q}`).catch(() =>
      Linking.openURL(`https://www.google.com/maps/search/${q}`),
    );
  };
  const callPoison = () => {
    trackEvent('emergency_click', { target: 'poison' });
    Linking.openURL(`tel:${POISON_HOTLINE.tel}`).catch(() => {});
  };

  return (
    <SafetyCard banner="IN AN EMERGENCY" icon={<MaterialCommunityIcons name="hospital-box" size={18} color={colors.danger} />}>
      <PaperButton icon="hospital-box" label="Nearest emergency vet" onPress={openVet} />
      <PaperButton icon="phone-alert" label={`Poison hotline ${POISON_HOTLINE.display}`} onPress={callPoison} />
      <Text style={safetyText.note}>{POISON_HOTLINE.note}</Text>
    </SafetyCard>
  );
}
