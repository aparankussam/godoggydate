import Expo
import React
import ReactAppDependencyProvider

@UIApplicationMain
public class AppDelegate: ExpoAppDelegate {
  var window: UIWindow?

  var reactNativeDelegate: ExpoReactNativeFactoryDelegate?
  var reactNativeFactory: RCTReactNativeFactory?

  // App-icon shortcut "My dog is lost" (UIApplicationShortcutItems in Info.plist
  // and app.config.js) opens the one-question alert screen, app/lost/now.tsx.
  static let lostShortcutType = "com.godoggydate.app.lostdog"
  static let lostURL = URL(string: "godoggydate://lost/now")!
  private var launchedFromLostShortcut = false

  public override func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
  ) -> Bool {
    // A cold launch from the shortcut: hand the screen's URL to React Native as the
    // launch URL, so the app opens straight on it.
    var options = launchOptions
    if let item = launchOptions?[.shortcutItem] as? UIApplicationShortcutItem, item.type == AppDelegate.lostShortcutType {
      launchedFromLostShortcut = true
      var withURL = launchOptions ?? [:]
      withURL[.url] = AppDelegate.lostURL
      options = withURL
    }

    let delegate = ReactNativeDelegate()
    let factory = ExpoReactNativeFactory(delegate: delegate)
    delegate.dependencyProvider = RCTAppDependencyProvider()

    reactNativeDelegate = delegate
    reactNativeFactory = factory
    bindReactNativeFactory(factory)

#if os(iOS) || os(tvOS)
    window = UIWindow(frame: UIScreen.main.bounds)
    factory.startReactNative(
      withModuleName: "main",
      in: window,
      launchOptions: options)
#endif

    return super.application(application, didFinishLaunchingWithOptions: options)
  }

  // The shortcut while the app is already running (or right after the cold launch above).
  public override func application(
    _ application: UIApplication,
    performActionFor shortcutItem: UIApplicationShortcutItem,
    completionHandler: @escaping (Bool) -> Void
  ) {
    guard shortcutItem.type == AppDelegate.lostShortcutType else {
      return super.application(application, performActionFor: shortcutItem, completionHandler: completionHandler)
    }
    if launchedFromLostShortcut {
      launchedFromLostShortcut = false // the launch URL already opens the screen
      completionHandler(true)
      return
    }
    completionHandler(RCTLinkingManager.application(application, open: AppDelegate.lostURL, options: [:]))
  }

  // Linking API
  public override func application(
    _ app: UIApplication,
    open url: URL,
    options: [UIApplication.OpenURLOptionsKey: Any] = [:]
  ) -> Bool {
    return super.application(app, open: url, options: options) || RCTLinkingManager.application(app, open: url, options: options)
  }

  // Universal Links
  public override func application(
    _ application: UIApplication,
    continue userActivity: NSUserActivity,
    restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void
  ) -> Bool {
    let result = RCTLinkingManager.application(application, continue: userActivity, restorationHandler: restorationHandler)
    return super.application(application, continue: userActivity, restorationHandler: restorationHandler) || result
  }
}

class ReactNativeDelegate: ExpoReactNativeFactoryDelegate {
  // Extension point for config-plugins

  override func sourceURL(for bridge: RCTBridge) -> URL? {
    // needed to return the correct URL for expo-dev-client.
    bridge.bundleURL ?? bundleURL()
  }

  override func bundleURL() -> URL? {
#if DEBUG
    return RCTBundleURLProvider.sharedSettings().jsBundleURL(forBundleRoot: ".expo/.virtual-metro-entry")
#else
    return Bundle.main.url(forResource: "main", withExtension: "jsbundle")
#endif
  }
}
