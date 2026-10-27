# 網頁呼叫的原生方法（window.EquiLensAndroid.postMessage）不可被縮減或改名
-keepclassmembers class io.github.wakin61043.equilens.Bridge {
    @android.webkit.JavascriptInterface <methods>;
}
