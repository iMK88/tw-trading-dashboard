import UIKit
import WebKit
import UserNotifications
import FirebaseMessaging

// 載入衡析網頁的畫面：使用者的衡析（https 網址）、App 內建的連線頁與示意模式（equilens://app）
final class WebViewController: UIViewController, WKNavigationDelegate, WKUIDelegate, WKScriptMessageHandler {
    static let shared = WebViewController()
    private static let background = UIColor(red: 7 / 255, green: 11 / 255, blue: 20 / 255, alpha: 1)

    private var web: WKWebView!
    private let demo = DemoServer()
    private var launcherError: String?
    private var pendingOpen: String?
    private var version: String { (Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String) ?? "1.0" }

    override func loadView() {
        let config = WKWebViewConfiguration()
        config.userContentController.add(WeakMessageHandler(self), name: "equilens")
        config.setURLSchemeHandler(demo, forURLScheme: DemoServer.scheme)
        config.applicationNameForUserAgent = "EquiLensApp/\(version) (iOS)"
        config.allowsInlineMediaPlayback = true
        web = WKWebView(frame: .zero, configuration: config)
        web.navigationDelegate = self
        web.uiDelegate = self
        web.isOpaque = false
        web.backgroundColor = Self.background
        web.scrollView.backgroundColor = Self.background
        // 網頁自己依 env(safe-area-inset-*) 留白（動態島、主畫面指示條）
        web.scrollView.contentInsetAdjustmentBehavior = .never
        view = web
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        start()
    }

    /* ---------- 載入：連線頁、使用者的衡析、示意模式 ---------- */
    private func start() {
        let open = pendingOpen
        pendingOpen = nil
        if AppStore.mode == "server", let server = AppStore.server { loadServer(server, path: open) }
        else if AppStore.mode == "demo" { loadDemo() }
        else { loadLauncher(nil) }
    }

    private func loadLauncher(_ error: String?) {
        AppStore.mode = "launcher"
        launcherError = error
        if let url = URL(string: "\(DemoServer.origin)/launcher/index.html") { web.load(URLRequest(url: url)) }
    }

    private func loadServer(_ server: String, path: String? = nil) {
        AppStore.mode = "server"
        let p = (path?.hasPrefix("/") ?? false) ? path! : "/"
        if let url = URL(string: server + p) { web.load(URLRequest(url: url)) }
    }

    private func loadDemo() {
        AppStore.mode = "demo"
        if let url = URL(string: "\(DemoServer.origin)/") { web.load(URLRequest(url: url)) }
    }

    // 點通知：同一個伺服器的頁面只切換分頁；其他網址（例如新聞原文）用瀏覽器開啟
    func open(_ target: String) {
        guard isViewLoaded, web != nil else { pendingOpen = target; return }
        let server = AppStore.server
        if let url = URL(string: target), url.scheme == "https", origin(url) != server { openExternal(url); return }
        guard AppStore.mode == "server", let server else { return }
        var path = target
        if let url = URL(string: target), url.scheme == "https" { path = url.path + (url.fragment.map { "#\($0)" } ?? "") }
        if let current = web.url, origin(current) == server {
            let data: [String: Any] = ["url": path]
            emit("open", data)
        } else {
            loadServer(server, path: path)
        }
    }

    private func origin(_ url: URL) -> String? {
        guard let scheme = url.scheme, let host = url.host else { return nil }
        return "\(scheme)://\(host)" + (url.port.map { ":\($0)" } ?? "")
    }

    private func allowed(_ url: URL) -> Bool {
        url.scheme == DemoServer.scheme || (AppStore.server != nil && origin(url) == AppStore.server)
    }

    private func openExternal(_ url: URL) {
        guard url.scheme == "https" || url.scheme == "http" else { return }
        UIApplication.shared.open(url)
    }

    /* ---------- 導覽 ---------- */
    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let url = navigationAction.request.url else { decisionHandler(.cancel); return }
        if allowed(url) || url.scheme == "about" { decisionHandler(.allow); return }
        openExternal(url)
        decisionHandler(.cancel)
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        let e = error as NSError
        guard e.code != NSURLErrorCancelled, AppStore.mode == "server", let server = AppStore.server else { return }
        loadLauncher(String(format: L("cannot_connect"), server))
    }

    // target="_blank" 的連結（新聞原文等）交給瀏覽器
    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration, for navigationAction: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        if let url = navigationAction.request.url { openExternal(url) }
        return nil
    }

    // 網頁的 alert／confirm／prompt（例如建立自選分組、刪除提醒）
    func webView(_ webView: WKWebView, runJavaScriptAlertPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping () -> Void) {
        let alert = UIAlertController(title: nil, message: message, preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: L("ok"), style: .default) { _ in completionHandler() })
        present(alert, animated: true)
    }

    func webView(_ webView: WKWebView, runJavaScriptConfirmPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (Bool) -> Void) {
        let alert = UIAlertController(title: nil, message: message, preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: L("cancel"), style: .cancel) { _ in completionHandler(false) })
        alert.addAction(UIAlertAction(title: L("ok"), style: .default) { _ in completionHandler(true) })
        present(alert, animated: true)
    }

    func webView(_ webView: WKWebView, runJavaScriptTextInputPanelWithPrompt prompt: String, defaultText: String?, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (String?) -> Void) {
        let alert = UIAlertController(title: nil, message: prompt, preferredStyle: .alert)
        alert.addTextField { $0.text = defaultText }
        alert.addAction(UIAlertAction(title: L("cancel"), style: .cancel) { _ in completionHandler(nil) })
        alert.addAction(UIAlertAction(title: L("ok"), style: .default) { _ in completionHandler(alert.textFields?.first?.text) })
        present(alert, animated: true)
    }

    /* ---------- 網頁 ↔ App ---------- */
    func emit(_ name: String, _ data: Any?) {
        guard isViewLoaded, web != nil else { return }
        web.evaluateJavaScript("window.__equilensEvent && window.__equilensEvent(\(json(name)), \(json(data)))", completionHandler: nil)
    }

    private func reply(_ id: Int, _ ok: Bool, _ value: Any?) {
        web.evaluateJavaScript("window.__equilensReply && window.__equilensReply(\(id), \(ok), \(json(value)))", completionHandler: nil)
    }

    private func json(_ value: Any?) -> String {
        guard let value, !(value is NSNull) else { return "null" }
        guard let data = try? JSONSerialization.data(withJSONObject: [value]), let text = String(data: data, encoding: .utf8) else { return "null" }
        return String(text.dropFirst().dropLast())
    }

    // 只接受 App 允許的頁面（使用者的衡析或 App 內建頁）送來的訊息
    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard message.frameInfo.isMainFrame else { return }
        let o = message.frameInfo.securityOrigin
        let from = "\(o.protocol)://\(o.host)" + (o.port > 0 ? ":\(o.port)" : "")
        guard o.protocol == DemoServer.scheme || from == AppStore.server else { return }
        guard let text = message.body as? String, let raw = text.data(using: .utf8),
              let msg = (try? JSONSerialization.jsonObject(with: raw)) as? [String: Any] else { return }
        let id = (msg["id"] as? Int) ?? 0
        let args = (msg["args"] as? [String: Any]) ?? [:]
        switch (msg["method"] as? String) ?? "" {
        case "info":
            let info: [String: Any] = ["platform": "ios", "version": version, "server": nullable(AppStore.server), "demo": AppStore.mode == "demo",
                                       "relay": Push.relay, "pushAvailable": Push.available, "servers": AppStore.recent, "error": nullable(launcherError)]
            launcherError = nil
            reply(id, true, info)
        case "connect": connect(id, (args["url"] as? String) ?? "")
        case "demo": reply(id, true, nil); loadDemo()
        case "launcher": reply(id, true, nil); loadLauncher(nil)
        case "openExternal":
            if let s = args["url"] as? String, let url = URL(string: s) { openExternal(url) }
            reply(id, true, nil)
        case "keepAwake":
            UIApplication.shared.isIdleTimerDisabled = (args["on"] as? Bool) ?? false
            reply(id, true, nil)
        case "theme":
            let light = (args["light"] as? Bool) ?? false
            view.window?.overrideUserInterfaceStyle = light ? .light : .dark
            reply(id, true, nil)
        case "pushToken": pushToken(id, prompt: (args["prompt"] as? Bool) ?? false)
        case "saveImage": saveImage(id, dataURL: (args["data"] as? String) ?? "")
        default: reply(id, false, "unknown method")
        }
    }

    // 連線前先確認網址是衡析手機版（/health 回傳 app: equilens-pocket）
    private func connect(_ id: Int, _ raw: String) {
        guard let url = URL(string: raw), url.scheme == "https", let target = origin(url), let health = URL(string: target + "/health") else {
            reply(id, false, L("invalid_url")); return
        }
        var request = URLRequest(url: health, timeoutInterval: 10)
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        URLSession.shared.dataTask(with: request) { data, response, _ in
            let status = (response as? HTTPURLResponse)?.statusCode ?? 0
            let body = data.flatMap { (try? JSONSerialization.jsonObject(with: $0)) as? [String: Any] }
            let ok = status == 200 && (body?["app"] as? String) == "equilens-pocket"
            DispatchQueue.main.async {
                guard ok else { self.reply(id, false, String(format: L("not_pocket"), target)); return }
                AppStore.server = target
                AppStore.addRecent(target)
                self.reply(id, true, nil)
                self.loadServer(target)
            }
        }.resume()
    }

    /* ---------- 推播（APNs 經 Firebase） ---------- */
    private func pushToken(_ id: Int, prompt: Bool) {
        guard Push.available else {
            let r: [String: Any] = ["token": NSNull(), "permission": "unavailable"]
            reply(id, true, r); return
        }
        UNUserNotificationCenter.current().getNotificationSettings { settings in
            DispatchQueue.main.async {
                switch settings.authorizationStatus {
                case .authorized, .provisional, .ephemeral:
                    self.fetchToken(id, attempts: 6)
                case .denied:
                    let r: [String: Any] = ["token": NSNull(), "permission": "denied"]
                    self.reply(id, true, r)
                default:
                    guard prompt else {
                        let r: [String: Any] = ["token": NSNull(), "permission": "default"]
                        self.reply(id, true, r); return
                    }
                    UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge]) { granted, _ in
                        DispatchQueue.main.async {
                            if granted { self.fetchToken(id, attempts: 6) } else {
                                let r: [String: Any] = ["token": NSNull(), "permission": "denied"]
                                self.reply(id, true, r)
                            }
                        }
                    }
                }
            }
        }
    }

    // 剛註冊時 Apple 的裝置 token 還沒回來，FCM token 會暫時取不到：每秒重試，最多數次
    private func fetchToken(_ id: Int, attempts: Int) {
        UIApplication.shared.registerForRemoteNotifications()
        Messaging.messaging().token { token, _ in
            DispatchQueue.main.async {
                if token == nil && attempts > 1 {
                    DispatchQueue.main.asyncAfter(deadline: .now() + 1) { self.fetchToken(id, attempts: attempts - 1) }
                    return
                }
                if let token { AppStore.pushToken = token }
                let r: [String: Any] = ["token": nullable(token), "permission": "granted"]
                self.reply(id, true, r)
            }
        }
    }

    /* ---------- 圖卡：開分享選單（可選「儲存影像」存到照片） ---------- */
    private func saveImage(_ id: Int, dataURL: String) {
        guard let comma = dataURL.firstIndex(of: ","), let data = Data(base64Encoded: String(dataURL[dataURL.index(after: comma)...])),
              let image = UIImage(data: data) else { reply(id, false, L("save_failed")); return }
        let sheet = UIActivityViewController(activityItems: [image], applicationActivities: nil)
        if let pop = sheet.popoverPresentationController {
            pop.sourceView = view
            pop.sourceRect = CGRect(x: view.bounds.midX, y: view.bounds.midY, width: 1, height: 1)
            pop.permittedArrowDirections = []
        }
        sheet.completionWithItemsHandler = { _, completed, _, _ in self.reply(id, true, completed ? "shared" : "cancelled") }
        present(sheet, animated: true)
    }
}

// WKUserContentController 會強引用訊息處理者，用弱引用轉接避免循環引用
final class WeakMessageHandler: NSObject, WKScriptMessageHandler {
    weak var target: WKScriptMessageHandler?
    init(_ target: WKScriptMessageHandler) { self.target = target }
    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        target?.userContentController(userContentController, didReceive: message)
    }
}
