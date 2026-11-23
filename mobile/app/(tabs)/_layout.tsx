import { useEffect, useState, type ComponentProps } from 'react';
import { Tabs } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { colors, fonts } from '../../constants/theme';
import { useSession } from '../../lib/session';
import { subscribeUnreadCount } from '../../lib/matches';

/** Live unread count for the Matches tab, like web's bottom-nav badge. */
function useUnreadMatchesBadge(): string | number | undefined {
  const { user } = useSession();
  const uid = user?.uid;
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!uid) {
      setCount(0);
      return undefined;
    }
    return subscribeUnreadCount(uid, setCount);
  }, [uid]);

  if (count <= 0) return undefined;
  return count > 9 ? '9+' : count;
}

type Glyph =
  | { set: 'ion'; name: ComponentProps<typeof Ionicons>['name'] }
  | { set: 'mci'; name: ComponentProps<typeof MaterialCommunityIcons>['name'] };

/** Filled chunky glyphs, same meaning as web/components/AppNav.tsx:
 *  paw = Discover, tree = Pack Day, heart = Matches, dog = Profile. */
const GLYPHS: Record<'discover' | 'pack' | 'matches' | 'profile', Glyph> = {
  discover: { set: 'ion', name: 'paw' },
  pack: { set: 'mci', name: 'tree' },
  matches: { set: 'ion', name: 'heart' },
  profile: { set: 'mci', name: 'dog' },
};

function TabIcon({
  glyph,
  label,
  focused,
}: {
  glyph: Glyph;
  label: string;
  focused: boolean;
}) {
  // Selected = ink pill with a paper icon; otherwise a plain ink icon.
  const color = focused ? colors.paper : colors.ink;
  return (
    <View style={styles.tabIcon}>
      <View style={[styles.pill, focused && styles.pillActive]}>
        {glyph.set === 'ion' ? (
          <Ionicons name={glyph.name} size={23} color={color} />
        ) : (
          <MaterialCommunityIcons name={glyph.name} size={25} color={color} />
        )}
      </View>
      <Text style={styles.label} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

export default function TabsLayout() {
  const matchesBadge = useUnreadMatchesBadge();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarShowLabel: false,
        tabBarStyle: styles.tabBar,
        sceneStyle: { backgroundColor: colors.sky },
      }}
    >
      <Tabs.Screen
        name="discover"
        options={{
          title: 'Discover',
          tabBarAccessibilityLabel: 'Discover',
          tabBarIcon: ({ focused }) => (
            <TabIcon glyph={GLYPHS.discover} label="Discover" focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="pack"
        options={{
          title: 'Pack Day',
          tabBarAccessibilityLabel: 'Pack Day',
          tabBarIcon: ({ focused }) => (
            <TabIcon glyph={GLYPHS.pack} label="Pack Day" focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="matches"
        options={{
          title: 'Matches',
          tabBarAccessibilityLabel: 'Matches',
          tabBarIcon: ({ focused }) => (
            <TabIcon glyph={GLYPHS.matches} label="Matches" focused={focused} />
          ),
          tabBarBadge: matchesBadge,
          tabBarBadgeStyle: styles.badge,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarAccessibilityLabel: 'Profile',
          tabBarIcon: ({ focused }) => (
            <TabIcon glyph={GLYPHS.profile} label="Profile" focused={focused} />
          ),
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: colors.paper,
    borderTopColor: colors.ink,
    borderTopWidth: 2,
    height: 74,
    paddingTop: 6,
    paddingBottom: 8,
  },
  tabIcon: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 80,
  },
  pill: {
    width: 52,
    height: 32,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pillActive: {
    backgroundColor: colors.ink,
  },
  label: {
    fontFamily: fonts.bold,
    fontSize: 12,
    lineHeight: 15,
    color: colors.ink,
    marginTop: 3,
  },
  badge: {
    backgroundColor: colors.ink,
    color: colors.paper,
    fontFamily: fonts.black,
    fontSize: 12,
    borderWidth: 2,
    borderColor: colors.paper,
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    lineHeight: 18,
  },
});
