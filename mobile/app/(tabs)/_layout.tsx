import { useEffect, useState } from 'react';
import { Tabs } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
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

function TabIcon({
  emoji,
  label,
  focused,
}: {
  emoji: string;
  label: string;
  focused: boolean;
}) {
  return (
    <View style={styles.tabIcon}>
      <Text style={styles.emoji}>{emoji}</Text>
      <Text
        style={[styles.label, focused && styles.labelActive]}
        numberOfLines={1}
      >
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
      }}
    >
      <Tabs.Screen
        name="discover"
        options={{
          title: 'Discover',
          tabBarIcon: ({ focused }) => (
            <TabIcon emoji="🐾" label="Discover" focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="pack"
        options={{
          title: 'Pack Day',
          tabBarIcon: ({ focused }) => (
            <TabIcon emoji="🌳" label="Pack Day" focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="matches"
        options={{
          title: 'Matches',
          tabBarIcon: ({ focused }) => (
            <TabIcon emoji="💛" label="Matches" focused={focused} />
          ),
          tabBarBadge: matchesBadge,
          tabBarBadgeStyle: styles.badge,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ focused }) => (
            <TabIcon emoji="🐕" label="Profile" focused={focused} />
          ),
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: '#fff',
    borderTopColor: 'rgba(0,0,0,0.08)',
    borderTopWidth: StyleSheet.hairlineWidth,
    height: 64,
    paddingBottom: 8,
  },
  tabIcon: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 6,
    width: 72,
  },
  emoji: {
    fontSize: 22,
    lineHeight: 26,
  },
  label: {
    fontFamily: fonts.body,
    fontSize: 10,
    color: colors.brownLight,
    marginTop: 2,
    letterSpacing: 0.2,
  },
  labelActive: {
    color: colors.primary,
    fontFamily: fonts.semibold,
  },
  badge: {
    backgroundColor: colors.primary,
    color: '#fff',
    fontFamily: fonts.bold,
    fontSize: 10,
  },
});
