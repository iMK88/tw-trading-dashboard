import org.jetbrains.kotlin.gradle.dsl.JvmTarget

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}
// Firebase 推播：把 Firebase 專案的 google-services.json 放在這個資料夾才會啟用（沒有時 App 照常建置，只是不能推播）
if (file("google-services.json").exists()) apply(plugin = "com.google.gms.google-services")

// 設定值依序取自 -P／gradle.properties、環境變數、預設值
fun setting(name: String, env: String, default: String = ""): String =
    (findProperty(name) as String?)?.takeIf { it.isNotBlank() } ?: System.getenv(env)?.takeIf { it.isNotBlank() } ?: default

val keystore = setting("equilens.keystore", "EQUILENS_KEYSTORE")

android {
    namespace = "io.github.wakin61043.equilens"
    compileSdk = 36

    defaultConfig {
        applicationId = setting("equilens.appId", "EQUILENS_APP_ID", "io.github.wakin61043.equilens")
        minSdk = 29
        targetSdk = 36
        versionCode = setting("equilens.versionCode", "EQUILENS_VERSION_CODE", "1").toInt()
        versionName = setting("equilens.versionName", "EQUILENS_VERSION_NAME", "1.0.0")
        buildConfigField("String", "RELAY_URL", "\"${setting("equilens.relayUrl", "EQUILENS_RELAY_URL")}\"")
    }

    // 上傳金鑰（Play App Signing 的 upload key）：只從本機檔案或 CI 秘密讀取，絕不放進版本庫
    signingConfigs {
        if (keystore.isNotEmpty()) create("upload") {
            storeFile = file(keystore)
            storePassword = setting("equilens.keystorePassword", "EQUILENS_KEYSTORE_PASSWORD")
            keyAlias = setting("equilens.keyAlias", "EQUILENS_KEY_ALIAS", "upload")
            keyPassword = setting("equilens.keyPassword", "EQUILENS_KEY_PASSWORD")
        }
    }
    buildTypes {
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
            if (keystore.isNotEmpty()) signingConfig = signingConfigs.getByName("upload")
        }
    }
    buildFeatures { buildConfig = true }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}
kotlin { compilerOptions { jvmTarget.set(JvmTarget.JVM_17) } }

// App 內建的網頁：連線頁、示意模式用的手機版畫面（與 EquiLens-Pocket/public 相同）與示意資料，建置前複製進 assets
val syncWeb by tasks.registering(Sync::class) {
    from("../../web/launcher") { into("launcher") }
    from("../../../EquiLens-Pocket/public") { into("demo/www"); exclude("sw.js") }
    from("../../web/demo/demo-api.json") { into("demo") }
    into("src/main/assets")
}
tasks.named("preBuild") { dependsOn(syncWeb) }

dependencies {
    implementation("androidx.core:core-ktx:1.17.0")
    implementation("androidx.activity:activity-ktx:1.11.0")
    // Firebase 間接帶入舊版 Fragment；ActivityResult API（通知權限）需要 1.3 以上
    implementation("androidx.fragment:fragment-ktx:1.8.9")
    implementation("com.google.firebase:firebase-messaging:25.1.3")
    testImplementation("junit:junit:4.13.2")
}
