const easProjectId =
  process.env.EXPO_PUBLIC_EAS_PROJECT_ID ??
  process.env.EAS_PROJECT_ID ??
  '481f95ac-9bc4-4ecd-8e03-244dc7b69d3d';
const isProductionLikeBuild =
  process.env.EAS_BUILD === 'true' ||
  process.env.CI === 'true' ||
  process.env.NODE_ENV === 'production';

if (isProductionLikeBuild && easProjectId === 'YOUR_EAS_PROJECT_ID') {
  throw new Error(
    'Missing real Expo EAS project id. Set EXPO_PUBLIC_EAS_PROJECT_ID or EAS_PROJECT_ID before production/CI builds.',
  );
}

module.exports = {
  expo: {
    name: 'GoDoggyDate',
    slug: 'godoggydate',
    version: '1.0.0',
    orientation: 'portrait',
    icon: './assets/icon.png',
    userInterfaceStyle: 'light',
    splash: {
      image: './assets/splash.png',
      resizeMode: 'contain',
      backgroundColor: '#FFFFFF',
    },
    assetBundlePatterns: ['**/*'],
    ios: {
      supportsTablet: false,
      bundleIdentifier: 'com.godoggydate.app',
      googleServicesFile: './GoogleService-Info.plist',
      usesAppleSignIn: true,
      // Universal links: household invites (/app/household/join) and Pack Day
      // pages (/pack/*) open the app when it's installed. The site serves the
      // matching file at /.well-known/apple-app-site-association
      // (web/app/.well-known/apple-app-site-association/route.ts). Native
      // change: needs a new build; EAS syncs the Associated Domains capability.
      associatedDomains: ['applinks:godoggydate.com'],
      config: {
        // Standard HTTPS only; qualifies for the EAR mass-market exemption.
        // Skips Apple's encryption compliance prompt on every future build.
        usesNonExemptEncryption: false,
      },
      infoPlist: {
        NSLocationWhenInUseUsageDescription: 'We use your location to show nearby dogs.',
        NSCameraUsageDescription: 'Upload a photo of your dog.',
        NSPhotoLibraryUsageDescription: 'Choose a photo from your library.',
        NSMicrophoneUsageDescription: "Record your dog's bark for Snoot Boop.",
        // App-icon shortcut, handled in ios/GoDoggyDate/AppDelegate.swift (opens /lost/now).
        UIApplicationShortcutItems: [
          {
            UIApplicationShortcutItemType: 'com.godoggydate.app.lostdog',
            UIApplicationShortcutItemTitle: 'My dog is lost',
            UIApplicationShortcutItemSubtitle: 'Alert your neighbors now',
            UIApplicationShortcutItemIconSymbolName: 'exclamationmark.triangle.fill',
          },
        ],
      },
    },
    android: {
      adaptiveIcon: {
        foregroundImage: './assets/adaptive-icon.png',
        backgroundColor: '#58C6FC',
      },
      package: 'com.godoggydate.app',
      permissions: ['ACCESS_FINE_LOCATION', 'CAMERA', 'READ_EXTERNAL_STORAGE'],
    },
    web: {
      favicon: './assets/favicon.png',
    },
    plugins: [
      'expo-dev-client',
      'expo-router',
      'expo-image-picker',
      'expo-apple-authentication',
      [
        'expo-location',
        {
          locationWhenInUsePermission: 'Show dogs near you.',
        },
      ],
      [
        '@stripe/stripe-react-native',
        {
          merchantIdentifier: 'merchant.com.godoggydate.app',
          enableGooglePay: false,
        },
      ],
      [
        '@react-native-google-signin/google-signin',
        {
          iosUrlScheme:
            'com.googleusercontent.apps.597697529529-33q6d5hdq2mvm27lps4gdm0rsmh5ab5c',
        },
      ],
    ],
    scheme: 'godoggydate',
    extra: {
      eas: {
        projectId: easProjectId,
      },
    },
  },
};
