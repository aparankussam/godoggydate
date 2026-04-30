const easProjectId =
  process.env.EXPO_PUBLIC_EAS_PROJECT_ID ??
  process.env.EAS_PROJECT_ID ??
  'YOUR_EAS_PROJECT_ID';
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
      backgroundColor: '#FDF6EE',
    },
    assetBundlePatterns: ['**/*'],
    ios: {
      supportsTablet: false,
      bundleIdentifier: 'com.godoggydate.app',
      googleServicesFile: './GoogleService-Info.plist',
      infoPlist: {
        NSLocationWhenInUseUsageDescription: 'We use your location to show nearby dogs.',
        NSCameraUsageDescription: 'Upload a photo of your dog.',
        NSPhotoLibraryUsageDescription: 'Choose a photo from your library.',
      },
    },
    android: {
      adaptiveIcon: {
        foregroundImage: './assets/adaptive-icon.png',
        backgroundColor: '#FDF6EE',
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
    ],
    scheme: 'godoggydate',
    extra: {
      eas: {
        projectId: easProjectId,
      },
    },
  },
};
