package io.github.wakin61043.equilens

import android.Manifest
import android.annotation.SuppressLint
import android.content.ContentValues
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Color
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Message
import android.provider.MediaStore
import android.util.Base64
import android.view.WindowManager
import android.webkit.CookieManager
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import androidx.activity.ComponentActivity
import androidx.activity.OnBackPressedCallback
import androidx.activity.SystemBarStyle
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import com.google.firebase.messaging.FirebaseMessaging
import org.json.JSONArray
import org.json.JSONObject
import java.lang.ref.WeakReference
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.Executors

// 衡析 App（Android）：WebView 載入使用者電腦上的衡析手機版（Pocket），或 App 內建的連線頁與示意模式。
// 網頁透過 window.EquiLensAndroid.postMessage 呼叫推播、存圖、螢幕恆亮等原生功能（協定見 EquiLens-Pocket/public/native.js）。
class MainActivity : ComponentActivity() {
    companion object {
        const val EXTRA_URL = "equilens.url"
        const val BG = 0xFF070B14.toInt()
        var current: WeakReference<MainActivity>? = null
    }

    lateinit var web: WebView
    private lateinit var root: FrameLayout
    private lateinit var store: AppStore
    private lateinit var demo: DemoServer
    private val io = Executors.newSingleThreadExecutor()
    private var clearHistory = false
    private var launcherError: String? = null
    private var permissionReply: ((Boolean) -> Unit)? = null
    private val notifPermission = registerForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        permissionReply?.invoke(granted); permissionReply = null
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        enableEdgeToEdge(SystemBarStyle.dark(Color.TRANSPARENT), SystemBarStyle.dark(Color.TRANSPARENT))
        super.onCreate(savedInstanceState)
        current = WeakReference(this)
        store = AppStore(this)
        demo = DemoServer(this)
        Push.ensureChannel(this)

        web = WebView(this)
        root = FrameLayout(this).apply { setBackgroundColor(BG); addView(web, FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT) }
        setContentView(root)
        // 全螢幕（Android 15 起強制）：以系統列、瀏海與鍵盤的高度留白，網頁內容不會被遮住
        ViewCompat.setOnApplyWindowInsetsListener(root) { v, insets ->
            val bars = insets.getInsets(WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout())
            val ime = insets.getInsets(WindowInsetsCompat.Type.ime())
            v.setPadding(bars.left, bars.top, bars.right, maxOf(bars.bottom, ime.bottom))
            WindowInsetsCompat.CONSUMED
        }

        with(web.settings) {
            javaScriptEnabled = true
            domStorageEnabled = true
            setSupportMultipleWindows(true)
            javaScriptCanOpenWindowsAutomatically = false
            allowFileAccess = false
            allowContentAccess = false
            textZoom = 100
            userAgentString = "$userAgentString EquiLensApp/${BuildConfig.VERSION_NAME} (Android)"
        }
        web.setBackgroundColor(BG)
        CookieManager.getInstance().setAcceptCookie(true)
        web.addJavascriptInterface(Bridge(this), "EquiLensAndroid")
        web.webViewClient = Client()
        web.webChromeClient = Chrome()
        web.setDownloadListener { url, _, _, _, _ -> if (url.startsWith("https://")) openExternal(url) }

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                if (web.canGoBack()) web.goBack() else { isEnabled = false; onBackPressedDispatcher.onBackPressed(); isEnabled = true }
            }
        })
        start(intent?.getStringExtra(EXTRA_URL))
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        intent.getStringExtra(EXTRA_URL)?.let { open(it) }
    }

    override fun onPause() { super.onPause(); CookieManager.getInstance().flush() }

    override fun onDestroy() { if (current?.get() === this) current = null; web.destroy(); super.onDestroy() }

    /* ---------- 載入：連線頁、使用者的衡析、示意模式 ---------- */
    private fun start(openUrl: String?) {
        val server = store.server
        when {
            store.mode == "server" && server != null -> loadServer(server, openUrl)
            store.mode == "demo" -> loadDemo()
            else -> loadLauncher(null)
        }
    }
    private fun loadLauncher(error: String?) {
        store.mode = "launcher"; launcherError = error; clearHistory = true
        web.loadUrl("${DemoServer.ORIGIN}/launcher/index.html")
    }
    private fun loadServer(server: String, path: String? = null) {
        store.mode = "server"; clearHistory = true
        web.loadUrl(server + (path?.takeIf { it.startsWith("/") } ?: "/"))
    }
    private fun loadDemo() { store.mode = "demo"; clearHistory = true; web.loadUrl("${DemoServer.ORIGIN}/") }

    // 點通知：同一個伺服器的頁面只切換分頁；其他網址（例如新聞原文）用瀏覽器開啟
    private fun open(url: String) {
        val server = store.server
        val uri = Uri.parse(url)
        if (uri.scheme == "https" && origin(uri) != server) return openExternal(url)
        if (store.mode != "server" || server == null) return
        val path = if (uri.scheme == "https") (uri.encodedPath ?: "/") + (uri.encodedFragment?.let { "#$it" } ?: "") else url
        if (web.url?.let { origin(Uri.parse(it)) } == server) emit("open", JSONObject().put("url", path)) else loadServer(server, path)
    }

    private fun origin(u: Uri): String? = if (u.scheme == null || u.host == null) null else "${u.scheme}://${u.host}${if (u.port > 0) ":${u.port}" else ""}"
    private fun allowed(u: Uri): Boolean = u.host == DemoServer.HOST && u.scheme == "https" || (store.server != null && origin(u) == store.server)

    fun openExternal(url: String) {
        if (!url.startsWith("https://") && !url.startsWith("http://")) return
        try { startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) } catch (_: Exception) { }
    }

    inner class Client : WebViewClient() {
        override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse? =
            if (request.url.host == DemoServer.HOST) demo.handle(request) else null

        override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
            if (allowed(request.url)) return false
            openExternal(request.url.toString()); return true
        }

        override fun onPageFinished(view: WebView, url: String) {
            if (clearHistory) { view.clearHistory(); clearHistory = false }
            CookieManager.getInstance().flush()
        }

        override fun onReceivedError(view: WebView, request: WebResourceRequest, error: WebResourceError) {
            val server = store.server
            if (request.isForMainFrame && store.mode == "server" && server != null && origin(request.url) == server)
                loadLauncher(getString(R.string.cannot_connect, server))
        }
    }

    inner class Chrome : WebChromeClient() {
        // target="_blank" 的連結（新聞原文等）：取出網址後交給瀏覽器
        override fun onCreateWindow(view: WebView, isDialog: Boolean, isUserGesture: Boolean, resultMsg: Message): Boolean {
            val temp = WebView(this@MainActivity)
            temp.webViewClient = object : WebViewClient() {
                override fun shouldOverrideUrlLoading(v: WebView, r: WebResourceRequest): Boolean { openExternal(r.url.toString()); v.destroy(); return true }
            }
            (resultMsg.obj as WebView.WebViewTransport).webView = temp
            resultMsg.sendToTarget()
            return true
        }
    }

    /* ---------- 網頁 ↔ App ---------- */
    fun emit(name: String, data: Any?) {
        web.evaluateJavascript("window.__equilensEvent && window.__equilensEvent(${JSONObject.quote(name)}, ${json(data)})", null)
    }
    private fun json(v: Any?): String = when (v) {
        null -> "null"
        is String -> JSONObject.quote(v)
        is JSONObject, is JSONArray, is Boolean, is Number -> v.toString()
        else -> JSONObject.quote(v.toString())
    }
    private fun reply(id: Int, ok: Boolean, value: Any?) {
        web.evaluateJavascript("window.__equilensReply && window.__equilensReply($id, $ok, ${json(value)})", null)
    }

    // 由 Bridge 在主執行緒呼叫；只接受 App 允許的頁面（使用者的衡析或 App 內建頁）
    fun onBridgeMessage(text: String) {
        val page = web.url?.let { Uri.parse(it) } ?: return
        if (!allowed(page)) return
        val msg = try { JSONObject(text) } catch (_: Exception) { return }
        val id = msg.optInt("id")
        val args = msg.optJSONObject("args") ?: JSONObject()
        when (msg.optString("method")) {
            "info" -> reply(id, true, JSONObject()
                .put("platform", "android").put("version", BuildConfig.VERSION_NAME).put("server", store.server ?: JSONObject.NULL)
                .put("demo", store.mode == "demo").put("relay", BuildConfig.RELAY_URL).put("pushAvailable", Push.available(this))
                .put("servers", JSONArray(store.recent)).put("error", launcherError ?: JSONObject.NULL).also { launcherError = null })
            "connect" -> connect(id, args.optString("url"))
            "demo" -> { reply(id, true, null); loadDemo() }
            "launcher" -> { reply(id, true, null); loadLauncher(null) }
            "openExternal" -> { openExternal(args.optString("url")); reply(id, true, null) }
            "keepAwake" -> {
                if (args.optBoolean("on")) window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON) else window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
                reply(id, true, null)
            }
            "theme" -> { applyTheme(args.optString("bg"), args.optBoolean("light")); reply(id, true, null) }
            "pushToken" -> pushToken(id, args.optBoolean("prompt"))
            "saveImage" -> saveImage(id, args.optString("name"), args.optString("data"))
            else -> reply(id, false, "unknown method")
        }
    }

    // 連線前先確認網址是衡析手機版（/health 回傳 app: equilens-pocket）
    private fun connect(id: Int, raw: String) {
        val target = try { Uri.parse(raw).takeIf { it.scheme == "https" && !it.host.isNullOrEmpty() }?.let { origin(it) } } catch (_: Exception) { null }
        if (target == null) return reply(id, false, getString(R.string.invalid_url))
        io.execute {
            val ok = try {
                val c = URL("$target/health").openConnection() as HttpURLConnection
                c.connectTimeout = 10000; c.readTimeout = 10000; c.setRequestProperty("Accept", "application/json")
                val body = c.inputStream.bufferedReader().use { it.readText() }
                c.responseCode == 200 && JSONObject(body).optString("app") == "equilens-pocket"
            } catch (_: Exception) { false }
            runOnUiThread {
                if (!ok) return@runOnUiThread reply(id, false, getString(R.string.not_pocket, target))
                store.server = target; store.addRecent(target)
                reply(id, true, null); loadServer(target)
            }
        }
    }

    private fun applyTheme(bg: String, light: Boolean) {
        val color = try { Color.parseColor(bg) } catch (_: Exception) { BG }
        root.setBackgroundColor(color); web.setBackgroundColor(color)
        WindowCompat.getInsetsController(window, root).apply { isAppearanceLightStatusBars = light; isAppearanceLightNavigationBars = light }
    }

    /* ---------- 推播（FCM） ---------- */
    private fun notificationsAllowed(): Boolean =
        NotificationManagerCompat.from(this).areNotificationsEnabled() &&
            (Build.VERSION.SDK_INT < 33 || ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED)

    private fun pushToken(id: Int, prompt: Boolean) {
        if (!Push.available(this)) return reply(id, true, JSONObject().put("token", JSONObject.NULL).put("permission", "unavailable"))
        val fetch: () -> Unit = {
            FirebaseMessaging.getInstance().token.addOnCompleteListener { t ->
                val token = if (t.isSuccessful) t.result else null
                if (token != null) store.pushToken = token
                reply(id, true, JSONObject().put("token", token ?: JSONObject.NULL).put("permission", "granted"))
            }
        }
        if (notificationsAllowed()) return fetch()
        val denied = JSONObject().put("token", JSONObject.NULL).put("permission", "denied")
        if (!prompt) return reply(id, true, if (store.askedNotifications) denied else JSONObject().put("token", JSONObject.NULL).put("permission", "default"))
        // Android 12 以下沒有通知權限對話框：通知被關閉時只能請使用者到系統設定開啟；已永久拒絕時系統不再詢問，直接回傳拒絕
        if (Build.VERSION.SDK_INT < 33) return reply(id, true, denied)
        store.askedNotifications = true
        permissionReply = { granted -> if (granted) fetch() else reply(id, true, JSONObject().put("token", JSONObject.NULL).put("permission", "denied")) }
        notifPermission.launch(Manifest.permission.POST_NOTIFICATIONS)
    }

    /* ---------- 圖卡存到相簿（Pictures/EquiLens） ---------- */
    private fun saveImage(id: Int, name: String, dataUrl: String) {
        io.execute {
            val result = try {
                val bytes = Base64.decode(dataUrl.substringAfter(","), Base64.DEFAULT)
                val values = ContentValues().apply {
                    put(MediaStore.Images.Media.DISPLAY_NAME, name.ifBlank { "equilens.png" }.replace(Regex("[\\\\/:*?\"<>|]"), "_"))
                    put(MediaStore.Images.Media.MIME_TYPE, "image/png")
                    put(MediaStore.Images.Media.RELATIVE_PATH, "Pictures/EquiLens")
                }
                val uri = contentResolver.insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, values) ?: throw IllegalStateException()
                contentResolver.openOutputStream(uri)?.use { it.write(bytes) } ?: throw IllegalStateException()
                true
            } catch (_: Exception) { false }
            runOnUiThread { if (result) reply(id, true, "saved") else reply(id, false, getString(R.string.save_failed)) }
        }
    }
}
