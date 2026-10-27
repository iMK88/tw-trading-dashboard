package io.github.wakin61043.equilens

import android.webkit.JavascriptInterface

// window.EquiLensAndroid：網頁呼叫原生功能的唯一入口。JavascriptInterface 在背景執行緒被呼叫，轉到主執行緒並由 MainActivity 檢查頁面來源。
class Bridge(private val activity: MainActivity) {
    @JavascriptInterface
    fun postMessage(json: String) {
        activity.runOnUiThread { activity.onBridgeMessage(json) }
    }
}
