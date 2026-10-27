package io.github.wakin61043.equilens

import android.content.Context
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import org.json.JSONObject
import java.io.ByteArrayInputStream
import java.io.InputStream
import java.util.Locale

// App 內建頁面（https://appassets.androidplatform.net）：
//   /launcher/…  連線頁（assets/launcher）
//   /m/…、/health、/locales/…  示意模式的 API，回放 assets/demo/demo-api.json 錄好的回應
//   其他路徑  示意模式的手機版畫面（assets/demo/www，與 EquiLens-Pocket/public 相同）
// 查詢鍵規則與 EquiLens-App/tools/demo-keys.mjs 相同，例如：
//   m/api/alerts?since=12 → m/api/alerts；m/api/intraday?id=2330&group=semi → m/api/intraday?group=semi&id=2330，再試 m/api/intraday?id=2330
class DemoServer(private val context: Context) {
    companion object {
        const val HOST = "appassets.androidplatform.net"
        const val ORIGIN = "https://$HOST"
        private val VOLATILE = setOf("since", "refresh", "_", "v", "t")
        private val ID_PARAMS = setOf("id", "pid", "wid", "i", "period")
        private val TYPES = mapOf("html" to "text/html", "js" to "text/javascript", "css" to "text/css", "json" to "application/json",
            "svg" to "image/svg+xml", "png" to "image/png", "webmanifest" to "application/manifest+json")

        fun keys(path: String, query: List<Pair<String, String>>): List<String> {
            val q = query.filter { it.first !in VOLATILE }.sortedWith(compareBy<Pair<String, String>>({ it.first }, { it.second }))
            fun join(list: List<Pair<String, String>>) = list.joinToString("&") { "${it.first}=${it.second}" }
            val ids = q.filter { it.first in ID_PARAMS }
            val out = mutableListOf(if (q.isEmpty()) path else "$path?${join(q)}")
            if (ids.isNotEmpty()) out.add("$path?${join(ids)}") else if (q.isNotEmpty()) out.add(path)
            return out.distinct()
        }
    }

    private val entries: Map<String, Pair<Int, String>> by lazy {
        try {
            val all = JSONObject(context.assets.open("demo/demo-api.json").bufferedReader().use { it.readText() }).getJSONObject("entries")
            buildMap { for (k in all.keys()) { val e = all.getJSONObject(k); put(k, e.optInt("s", 200) to e.optString("b")) } }
        } catch (_: Exception) { emptyMap() }
    }

    fun handle(req: WebResourceRequest): WebResourceResponse {
        val path = (req.url.path ?: "/").removePrefix("/")
        if (path.startsWith("launcher/")) return asset(path)
        if (req.method == "POST") return entries["POST $path"]?.let { json(it.first, it.second) } ?: json(403, error(R.string.demo_readonly))
        val api = path.startsWith("m/") || path == "health" || path.startsWith("locales/")
        if (!api) return asset("demo/www/" + path.ifEmpty { "index.html" })
        // 非中文的手機用英文介面的錄製變體
        if (Locale.getDefault().language != "zh" && (path == "health" || path == "m/auth/me")) entries["$path#en"]?.let { return json(it.first, it.second) }
        val query = req.url.queryParameterNames.flatMap { n -> req.url.getQueryParameters(n).map { n to it } }
        for (k in keys(path, query)) entries[k]?.let { return json(it.first, it.second) }
        return json(404, error(R.string.demo_missing))
    }

    private fun error(res: Int) = JSONObject().put("error", context.getString(res)).toString()
    private fun json(status: Int, body: String) = response(status, "application/json", ByteArrayInputStream(body.toByteArray()))
    private fun asset(name: String): WebResourceResponse {
        if (name.contains("..")) return json(404, "{}")
        val stream: InputStream = try { context.assets.open(name) } catch (_: Exception) { return response(404, "text/plain", ByteArrayInputStream(ByteArray(0))) }
        return response(200, TYPES[name.substringAfterLast('.', "")] ?: "application/octet-stream", stream)
    }
    private fun response(status: Int, mime: String, data: InputStream) =
        WebResourceResponse(mime, "utf-8", status, if (status == 200) "OK" else "Error", mapOf("Cache-Control" to "no-store"), data)
}
