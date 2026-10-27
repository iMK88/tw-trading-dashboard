import SwiftUI
import UIKit
import UserNotifications
import FirebaseCore
import FirebaseMessaging

// 衡析 App（iOS）：WKWebView 載入使用者電腦上的衡析手機版（Pocket），或 App 內建的連線頁與示意模式。
// 網頁透過 window.webkit.messageHandlers.equilens 呼叫推播、存圖、螢幕恆亮等原生功能（協定見 EquiLens-Pocket/public/native.js）。
@main
struct EquiLensApp: App {
    @UIApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate

    var body: some Scene {
        WindowGroup {
            WebContainer()
                .ignoresSafeArea()
                .background(Color(red: 7 / 255, green: 11 / 255, blue: 20 / 255))
        }
    }
}

struct WebContainer: UIViewControllerRepresentable {
    func makeUIViewController(context: Context) -> WebViewController { WebViewController.shared }
    func updateUIViewController(_ controller: WebViewController, context: Context) {}
}

final class AppDelegate: NSObject, UIApplicationDelegate, UNUserNotificationCenterDelegate, MessagingDelegate {
    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil) -> Bool {
        UNUserNotificationCenter.current().delegate = self
        if Push.configured {
            FirebaseApp.configure()
            Messaging.messaging().delegate = self
            // 已允許通知時，啟動就向 Apple 註冊，推播 token 才會及時更新
            UNUserNotificationCenter.current().getNotificationSettings { settings in
                if settings.authorizationStatus == .authorized {
                    DispatchQueue.main.async { application.registerForRemoteNotifications() }
                }
            }
        }
        return true
    }

    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        if Push.configured { Messaging.messaging().apnsToken = deviceToken }
    }

    // FCM token 更新：通知網頁改登記新的 token
    func messaging(_ messaging: Messaging, didReceiveRegistrationToken fcmToken: String?) {
        guard let token = fcmToken else { return }
        let old = AppStore.pushToken
        AppStore.pushToken = token
        guard old != token else { return }
        DispatchQueue.main.async {
            let data: [String: Any] = ["token": token, "old": nullable(old)]
            WebViewController.shared.emit("pushToken", data)
        }
    }

    // App 在前景時也顯示通知
    func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification, withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void) {
        completionHandler([.banner, .list, .sound])
    }

    // 點通知：開啟對應的分頁或新聞
    func userNotificationCenter(_ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse, withCompletionHandler completionHandler: @escaping () -> Void) {
        if let url = response.notification.request.content.userInfo["url"] as? String {
            DispatchQueue.main.async { WebViewController.shared.open(url) }
        }
        completionHandler()
    }
}

enum Push {
    // 推播需要：建置時放入 GoogleService-Info.plist（Firebase 專案）並設定推播中繼網址
    static var configured: Bool { Bundle.main.path(forResource: "GoogleService-Info", ofType: "plist") != nil }
    static var relay: String { ((Bundle.main.object(forInfoDictionaryKey: "EquiLensRelayURL") as? String) ?? "").trimmingCharacters(in: .whitespaces) }
    static var available: Bool { configured && relay.hasPrefix("https://") }
}

// App 的設定：目前模式（launcher／server／demo）、連線的衡析網址、最近連過的網址、推播 token
enum AppStore {
    private static let defaults = UserDefaults.standard
    static var mode: String {
        get { defaults.string(forKey: "mode") ?? "launcher" }
        set { defaults.set(newValue, forKey: "mode") }
    }
    static var server: String? {
        get { defaults.string(forKey: "server") }
        set { defaults.set(newValue, forKey: "server") }
    }
    static var pushToken: String? {
        get { defaults.string(forKey: "pushToken") }
        set { defaults.set(newValue, forKey: "pushToken") }
    }
    static var recent: [String] { defaults.stringArray(forKey: "recent") ?? [] }
    static func addRecent(_ url: String) {
        defaults.set(Array(([url] + recent.filter { $0 != url }).prefix(5)), forKey: "recent")
    }
}

func nullable(_ value: String?) -> Any {
    if let value { return value }
    return NSNull()
}

// 原生畫面的文字（中文手機用繁體中文，其他用英文）
func L(_ key: String) -> String {
    let zh = Locale.preferredLanguages.first?.hasPrefix("zh") ?? false
    let table: [String: (String, String)] = [
        "cannot_connect": ("無法連到 %@，請確認電腦已開機且衡析正在執行。", "Cannot reach %@. Make sure the computer is on and EquiLens is running."),
        "invalid_url": ("請輸入 https:// 開頭的網址", "Enter an https:// address"),
        "not_pocket": ("%@ 不是衡析手機版的網址，或目前無法連線。", "%@ is not an EquiLens Pocket address, or it cannot be reached right now."),
        "save_failed": ("圖片儲存失敗", "Could not save the image"),
        "demo_readonly": ("示意模式無法變更設定或查詢新資料", "Demo mode cannot change settings or query new data"),
        "demo_missing": ("示意模式沒有這項資料", "Demo mode has no data for this"),
        "ok": ("確定", "OK"),
        "cancel": ("取消", "Cancel"),
    ]
    guard let pair = table[key] else { return key }
    return zh ? pair.0 : pair.1
}
