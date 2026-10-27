package io.github.wakin61043.equilens

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import com.google.firebase.FirebaseApp
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import org.json.JSONObject

object Push {
    const val CHANNEL = "equilens"
    // 推播需要：建置時放入 google-services.json（Firebase 專案）並設定推播中繼網址
    fun available(context: Context): Boolean = BuildConfig.RELAY_URL.isNotEmpty() && FirebaseApp.getApps(context).isNotEmpty()

    fun ensureChannel(context: Context) {
        val nm = context.getSystemService(NotificationManager::class.java) ?: return
        if (nm.getNotificationChannel(CHANNEL) != null) return
        nm.createNotificationChannel(NotificationChannel(CHANNEL, context.getString(R.string.channel_name), NotificationManager.IMPORTANCE_HIGH).apply {
            description = context.getString(R.string.channel_desc)
        })
    }

    // 顯示通知；同一個 tag（例如同一檔股票的同一種提醒）會取代舊的通知
    fun show(context: Context, title: String, body: String, tag: String, url: String) {
        ensureChannel(context)
        val intent = Intent(context, MainActivity::class.java).putExtra(MainActivity.EXTRA_URL, url)
            .addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP)
        val pending = PendingIntent.getActivity(context, (tag + url).hashCode(), intent, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
        val n = NotificationCompat.Builder(context, CHANNEL)
            .setSmallIcon(R.drawable.ic_stat_equilens)
            .setColor(0xFF2EE6FF.toInt())
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(NotificationCompat.BigTextStyle().bigText(body))
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setAutoCancel(true)
            .setContentIntent(pending)
            .build()
        try { NotificationManagerCompat.from(context).notify(tag.ifEmpty { title }, 1, n) } catch (_: SecurityException) { }
    }
}

// Firebase 推播：Android 收 data 訊息（推播中繼送出），由 App 自己顯示，點擊時開啟對應的分頁或新聞
class PushService : FirebaseMessagingService() {
    override fun onNewToken(token: String) {
        val store = AppStore(this)
        val old = store.pushToken
        store.pushToken = token
        MainActivity.current?.get()?.let { a -> a.runOnUiThread { a.emit("pushToken", JSONObject().put("token", token).put("old", old ?: JSONObject.NULL)) } }
    }

    override fun onMessageReceived(message: RemoteMessage) {
        val d = message.data
        val title = d["title"] ?: message.notification?.title ?: return
        Push.show(this, title, d["body"] ?: message.notification?.body ?: "", d["tag"] ?: "", d["url"] ?: "/")
    }
}
