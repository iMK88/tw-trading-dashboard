import Foundation
import WebKit

// App 內建頁面（equilens://app）：
//   /launcher/…  連線頁（套件中的 launcher 資料夾）
//   /m/…、/health、/locales/…  示意模式的 API，回放 demo/demo-api.json 錄好的回應
//   其他路徑  示意模式的手機版畫面（套件中的 public 資料夾，與 EquiLens-Pocket/public 相同）
// 查詢鍵規則與 EquiLens-App/tools/demo-keys.mjs 相同，例如：
//   m/api/alerts?since=12 → m/api/alerts；m/api/intraday?id=2330&group=semi → m/api/intraday?group=semi&id=2330，再試 m/api/intraday?id=2330
final class DemoServer: NSObject, WKURLSchemeHandler {
    static let scheme = "equilens"
    static let origin = "equilens://app"
    private static let volatile: Set<String> = ["since", "refresh", "_", "v", "t"]
    private static let idParams: Set<String> = ["id", "pid", "wid", "i", "period"]
    private static let types = ["html": "text/html", "js": "text/javascript", "css": "text/css", "json": "application/json",
                                "svg": "image/svg+xml", "png": "image/png", "webmanifest": "application/manifest+json"]

    private lazy var entries: [String: (Int, String)] = DemoServer.load()

    private static func load() -> [String: (Int, String)] {
        guard let url = Bundle.main.url(forResource: "demo-api", withExtension: "json", subdirectory: "demo"),
              let data = try? Data(contentsOf: url),
              let root = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any],
              let all = root["entries"] as? [String: [String: Any]] else { return [:] }
        var out: [String: (Int, String)] = [:]
        for (key, entry) in all { out[key] = ((entry["s"] as? Int) ?? 200, (entry["b"] as? String) ?? "") }
        return out
    }

    static func keys(_ path: String, _ query: [(String, String)]) -> [String] {
        let q = query.filter { !volatile.contains($0.0) }.sorted { $0.0 == $1.0 ? $0.1 < $1.1 : $0.0 < $1.0 }
        func join(_ list: [(String, String)]) -> String { list.map { "\($0.0)=\($0.1)" }.joined(separator: "&") }
        let ids = q.filter { idParams.contains($0.0) }
        var out = [q.isEmpty ? path : "\(path)?\(join(q))"]
        if !ids.isEmpty { out.append("\(path)?\(join(ids))") } else if !q.isEmpty { out.append(path) }
        var seen = Set<String>()
        return out.filter { seen.insert($0).inserted }
    }

    func webView(_ webView: WKWebView, start urlSchemeTask: any WKURLSchemeTask) {
        guard let url = urlSchemeTask.request.url else { return }
        let path = String(url.path.drop(while: { $0 == "/" }))
        if path.hasPrefix("launcher/") { return file(urlSchemeTask, url, path) }
        if urlSchemeTask.request.httpMethod == "POST" {
            if let e = entries["POST \(path)"] { return send(urlSchemeTask, url, e.0, "application/json", Data(e.1.utf8)) }
            return send(urlSchemeTask, url, 403, "application/json", error("demo_readonly"))
        }
        let api = path.hasPrefix("m/") || path == "health" || path.hasPrefix("locales/")
        if !api { return file(urlSchemeTask, url, "public/" + (path.isEmpty ? "index.html" : path)) }
        // 非中文的手機用英文介面的錄製變體
        let zh = Locale.preferredLanguages.first?.hasPrefix("zh") ?? false
        if !zh, path == "health" || path == "m/auth/me", let e = entries["\(path)#en"] {
            return send(urlSchemeTask, url, e.0, "application/json", Data(e.1.utf8))
        }
        let items = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems ?? []
        for key in DemoServer.keys(path, items.map { ($0.name, $0.value ?? "") }) {
            if let e = entries[key] { return send(urlSchemeTask, url, e.0, "application/json", Data(e.1.utf8)) }
        }
        send(urlSchemeTask, url, 404, "application/json", error("demo_missing"))
    }

    func webView(_ webView: WKWebView, stop urlSchemeTask: any WKURLSchemeTask) {}

    private func error(_ key: String) -> Data {
        (try? JSONSerialization.data(withJSONObject: ["error": L(key)])) ?? Data("{}".utf8)
    }

    private func file(_ task: any WKURLSchemeTask, _ url: URL, _ name: String) {
        guard !name.contains(".."), let base = Bundle.main.resourceURL,
              let data = try? Data(contentsOf: base.appendingPathComponent(name)) else {
            return send(task, url, 404, "text/plain", Data())
        }
        let ext = (name as NSString).pathExtension.lowercased()
        send(task, url, 200, DemoServer.types[ext] ?? "application/octet-stream", data)
    }

    private func send(_ task: any WKURLSchemeTask, _ url: URL, _ status: Int, _ mime: String, _ data: Data) {
        let headers = ["Content-Type": mime.hasPrefix("text/") || mime == "application/json" ? "\(mime); charset=utf-8" : mime, "Cache-Control": "no-store"]
        guard let response = HTTPURLResponse(url: url, statusCode: status, httpVersion: "HTTP/1.1", headerFields: headers) else { return }
        task.didReceive(response)
        task.didReceive(data)
        task.didFinish()
    }
}
