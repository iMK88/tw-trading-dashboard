package io.github.wakin61043.equilens

import android.content.Context
import org.json.JSONArray

// App 的設定：目前模式（launcher／server／demo）、連線的衡析網址、最近連過的網址、推播 token
class AppStore(context: Context) {
    private val prefs = context.getSharedPreferences("equilens", Context.MODE_PRIVATE)
    var mode: String
        get() = prefs.getString("mode", "launcher") ?: "launcher"
        set(v) = prefs.edit().putString("mode", v).apply()
    var server: String?
        get() = prefs.getString("server", null)
        set(v) = prefs.edit().putString("server", v).apply()
    var pushToken: String?
        get() = prefs.getString("pushToken", null)
        set(v) = prefs.edit().putString("pushToken", v).apply()
    var askedNotifications: Boolean
        get() = prefs.getBoolean("askedNotifications", false)
        set(v) = prefs.edit().putBoolean("askedNotifications", v).apply()
    val recent: List<String>
        get() = try { JSONArray(prefs.getString("recent", "[]")).let { a -> List(a.length()) { a.getString(it) } } } catch (_: Exception) { emptyList() }
    fun addRecent(url: String) {
        val list = (listOf(url) + recent.filter { it != url }).take(5)
        prefs.edit().putString("recent", JSONArray(list).toString()).apply()
    }
}
