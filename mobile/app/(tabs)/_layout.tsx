import { Tabs } from 'expo-router';
import { View, Text, StyleSheet } from 'react-native';
import { colors, fonts } from '../../constants/theme';

function TabIcon({ emoji, label, focused }: { emoji: string; label: string; focused: boolean }) {
  return (
    <View style={styles.tabIcon}>
      <Text style={[styles.emoji, focused && styles.emojiFocused]}>{emoji}</Text>
      <Text style={[styles.label, focused && styles.labelFocused]}>{label}</Text>
    </View>
  );
}

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: styles.tabBar,
        tabBarShowLabel: false,
      }}
    >
      <Tabs.Screen
        name="discover"
        options={{
          tabBarIcon: ({ focused }: { focused: boolean }) => (
            <TabIcon emoji="🐾" label="Discover" focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="matches"
        options={{
          tabBarIcon: ({ focused }: { focused: boolean }) => (
            <TabIcon emoji="💛" label="Matches" focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          tabBarIcon: ({ focused }: { focused: boolean }) => (
            <TabIcon emoji="🐕" label="Profile" focused={focused} />
          ),
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: '#FFFFFF',
    borderTopColor: '#EAD9C8',
    borderTopWidth: 1,
    height: 80,
    paddingBottom: 8,
  },
  tabIcon: {
    alignItems: 'center',
    paddingTop: 8,
  },
  emoji: { fontSize: 24, opacity: 0.5 },
  emojiFocused: { opacity: 1 },
  label: {
    fontFamily: fonts.body,
    fontSize: 10,
    color: '#9B7560',
    marginTop: 2,
  },
  labelFocused: {
    fontFamily: fonts.bold,
    color: '#E8633A',
  },
});
