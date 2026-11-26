import { useEffect, useState, type ComponentProps } from 'react';
import { Tabs } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
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

type Glyph = ComponentProps<typeof MaterialCommunityIcons>['name'];

/** The same shapes as web/components/AppNav.tsx:
 *  paw = Discover, tree = Pack Day, heart = Matches, puzzle = Playroom, dog = Profile. */
const GLYPHS: Record<'discover' | 'pack' | 'matches' | 'playroom' | 'profile', Glyph> = {
  discover: 'paw',
  pack: 'tree',
  matches: 'heart',
  playroom: 'puzzle',
  profile: 'dog',
};

function TabIcon({
  glyph,
  label,
  focused,
  badge,
}: {
  glyph: Glyph;
  label: string;
  focused: boolean;
  badge?: string | number;
}) {
  // Selected = ink pill with a paper icon; otherwise a plain ink icon.
  const color = focused ? colors.paper : colors.ink;
  return (
    <View style={styles.tabIcon}>
      <View style={[styles.pill, focused && styles.pillActive]}>
        <MaterialCommunityIcons name={glyph} size={25} color={color} />
        {/* On the pill's top-right corner, so it never covers the icon. */}
        {badge !== undefined && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{badge}</Text>
          </View>
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
          title: 'Pack Days',
          tabBarAccessibilityLabel: 'Pack Days',
          tabBarIcon: ({ focused }) => (
            <TabIcon glyph={GLYPHS.pack} label="Pack Days" focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="matches"
        options={{
          title: 'Matches',
          tabBarAccessibilityLabel: matchesBadge ? `Matches, ${matchesBadge} unread` : 'Matches',
          tabBarIcon: ({ focused }) => (
            <TabIcon glyph={GLYPHS.matches} label="Matches" focused={focused} badge={matchesBadge} />
          ),
        }}
      />
      <Tabs.Screen
        name="playroom"
        options={{
          title: 'Playroom',
          tabBarAccessibilityLabel: 'Playroom',
          tabBarIcon: ({ focused }) => (
            <TabIcon glyph={GLYPHS.playroom} label="Playroom" focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Pupfile',
          tabBarAccessibilityLabel: 'Pupfile',
          tabBarIcon: ({ focused }) => (
            <TabIcon glyph={GLYPHS.profile} label="Pupfile" focused={focused} />
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
    width: 68,
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
    position: 'absolute',
    top: -6,
    right: -4,
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 3,
    backgroundColor: colors.ink,
    borderWidth: 2,
    borderColor: colors.paper,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { color: colors.paper, fontFamily: fonts.black, fontSize: 12, lineHeight: 15 },
});
