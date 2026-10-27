# 衡析 App：Google Play 與 App Store 上架包

衡析手機版（Pocket）的商店版 App。App 是原生殼：Android 用 Kotlin，iOS 用 Swift。它載入使用者自己電腦上的衡析手機版網頁，並補上網頁做不到的原生功能：推播、存圖、螢幕恆亮，以及沒有電腦也能試用的示意模式。

```
手機 App ──https──▶ 使用者電腦上的衡析 Pocket ──▶ Nexus（資料與金鑰）
   ▲                         │ 有新通知
   └── Firebase ◀── 推播中繼（Cloudflare Worker，由發行者營運）
```

- **公開上架、每人連自己的電腦**：App 沒有帳號系統。使用者輸入自己的衡析網址，並用電腦上設定的密碼登入。
- **推播走中繼**：Firebase 的發送金鑰屬於發行者，不能放在使用者的電腦上。所以由發行者營運的推播中繼代為發送；中繼不保存通知內容與 token。
- **畫面跟著電腦更新**：App 顯示的是電腦上衡析的網頁，大部分新功能不必重新上架。只有原生功能或示意資料改變時才需要送新版本。
- 使用說明見 [docs/features/mobile-app.md](../docs/features/mobile-app.md)；隱私權政策見 [docs/PRIVACY.zh-TW.md](../docs/PRIVACY.zh-TW.md)。

## 資料夾

| 路徑 | 內容 |
|---|---|
| `android/` | Android 專案（Gradle、Kotlin）：`MainActivity`（WebView、連線、推播權限、存圖）、`DemoServer`（示意模式）、`Push`（FCM） |
| `ios/` | iOS 專案（XcodeGen 定義檔 `project.yml`、Swift）：`WebViewController`、`DemoServer`、`EquiLensApp`（推播） |
| `web/launcher/` | App 內建的連線頁：輸入網址、最近網址、示意模式 |
| `web/demo/demo-api.json` | 示意模式的 API 回應（合成的示意資料，由 `tools/record-demo.mjs` 錄製） |
| `relay/` | 推播中繼（Cloudflare Worker）與測試 |
| `store/` | 商店文字（`listing.md`）、審查說明與資料安全表（`review.md`）、圖示與主題圖片（`assets/`）、截圖（`screenshots/`） |
| `tools/` | 錄製示意資料（`record-demo.mjs`）、示意新聞與行事曆（`demo-extras.mjs`）、瀏覽器預覽（`preview.mjs`）、產生上架素材（`store-assets.mjs`）、示意資料查詢規則（`demo-keys.mjs`） |
| `../.github/workflows/app-*.yml` | 在 GitHub 雲端建置 Android AAB 與 iOS（可自動上傳） |

App 內建的手機版畫面直接取自 `EquiLens-Pocket/public`（建置時複製），不另外保存一份。

## 一次性準備

| 項目 | 費用 | 用途 |
|---|---|---|
| Google Play 開發者帳號 | 一次 US$25 | 上架 Android |
| Apple Developer Program | 每年 US$99 | 上架 iOS（不一定要有 Mac，可用 GitHub Actions 的 Mac 主機建置） |
| Firebase 專案 | 免費 | 推播（Android 與 iOS 都經 Firebase Cloud Messaging） |
| Cloudflare 帳號 | 免費（Workers 每天 10 萬次請求） | 推播中繼 |

### 1. 決定套件名稱

- 預設為 `io.github.wakin61043.equilens`（Android 套件名稱與 iOS Bundle ID 相同）。
- 上架後不能更改。要改的話，修改 `android/gradle.properties` 的 `equilens.appId` 與 `ios/Config.xcconfig` 的 `EQUILENS_BUNDLE_ID`。

### 2. Firebase（推播）

1. 在 [Firebase 主控台](https://console.firebase.google.com/)建立專案。
2. 加入 Android App（套件名稱同上），下載 `google-services.json`，放到 `android/app/`。
3. 加入 iOS App（Bundle ID 同上），下載 `GoogleService-Info.plist`，放到 `ios/EquiLens/`。
4. 在 Apple Developer 的「Certificates, IDs & Profiles → Keys」建立 APNs 金鑰（.p8）。然後到 Firebase「專案設定 → Cloud Messaging → Apple 應用程式設定」上傳。
5. 在 Firebase「專案設定 → 服務帳戶」產生私密金鑰（JSON），下一步會用到。

這三個檔案都不會放進版本庫（已列在 `.gitignore`）。沒有它們時 App 仍可建置，只是沒有推播。

### 3. 部署推播中繼

```bash
cd EquiLens-App/relay
npx wrangler login
npx wrangler secret put FCM_SERVICE_ACCOUNT < 服務帳戶.json
npx wrangler deploy        # 會顯示網址，例如 https://equilens-push-relay.<你的帳號>.workers.dev
```

推播中繼網址是部署後的網址加上 `/v1/send`，填到：

- Android：`android/gradle.properties` 的 `equilens.relayUrl`。
- iOS：`ios/Local.xcconfig` 的 `EQUILENS_RELAY_URL`。xcconfig 中 `//` 是註解，網址要寫成 `https:/$()/equilens-push-relay.….workers.dev/v1/send`。

中繼的規格：

- 接受 `POST /v1/send { token, platform, title, body, tag, url }`。
- 回覆 404 代表 token 已失效，使用者電腦上的衡析會刪除那台裝置。
- 每個 token 每分鐘最多 30 則、每個來源 IP 每分鐘最多 600 則。

## Android：建置與上架

### 建立上傳金鑰（只做一次，妥善備份）

```bash
keytool -genkeypair -v -keystore equilens-upload.jks -alias upload -keyalg RSA -keysize 4096 -validity 10000
```

金鑰檔與密碼不要放進版本庫。遺失時要向 Google 申請重設上傳金鑰。

### 本機建置（Windows／Mac，Android Studio 或命令列）

```bash
cd EquiLens-App/android
./gradlew bundleRelease -Pequilens.keystore=/路徑/equilens-upload.jks -Pequilens.keystorePassword=… -Pequilens.keyPassword=…
# 產出：app/build/outputs/bundle/release/app-release.aab
```

- Windows 用 `gradlew.bat`。
- 也可以用 Android Studio 開啟 `EquiLens-App/android`，選「Build → Generate Signed App Bundle」。
- 需要 JDK 17 以上與 Android SDK 36（Android Studio 會自動安裝）。
- 每次上傳的 `equilens.versionCode` 都要比上一次大。

### 用 GitHub Actions 建置（不用自己裝 Android SDK）

1. 在 GitHub 倉庫的「Settings → Secrets and variables → Actions」設定：

   | 類型 | 名稱 | 內容 |
   |---|---|---|
   | 秘密 | `ANDROID_KEYSTORE_BASE64` | `base64 -w0 equilens-upload.jks` 的輸出 |
   | 秘密 | `ANDROID_KEYSTORE_PASSWORD`、`ANDROID_KEY_ALIAS`、`ANDROID_KEY_PASSWORD` | 上傳金鑰的密碼與別名 |
   | 秘密 | `GOOGLE_SERVICES_JSON_BASE64` | `google-services.json` 的 base64 |
   | 秘密（選填） | `PLAY_SERVICE_ACCOUNT_JSON` | Play Console API 服務帳戶；設定後會自動上傳到內部測試軌（第一次仍須手動上傳） |
   | 變數 | `EQUILENS_RELAY_URL` | 推播中繼網址 |
   | 變數（選填） | `EQUILENS_APP_ID` | 套件名稱 |

2. 到「Actions → App · Android → Run workflow」，或推送 `app-v1.0.0` 這類標籤。
3. 完成後在執行頁面下載 `equilens-android-aab`。版本號（versionCode）取自執行次數，會自動遞增。

### Play Console

1. 建立應用程式：名稱「衡析」、預設語言繁體中文、應用程式、免費。
2. 主要商店資訊：
   - 文字取自 `store/listing.md`。
   - 圖示 `store/assets/play-icon-512.png`、主題圖片 `store/assets/play-feature-1024x500.png`。
   - 手機截圖 `store/screenshots/play-phone/`、平板截圖 `store/screenshots/play-tablet/`。
3. 應用程式內容：
   - 隱私權政策網址、資料安全性、廣告（無）、內容分級、目標對象（18 歲以上）、金融功能聲明，答案見 `store/review.md`。
   - 「應用程式存取權」貼上審查說明（示意模式）。
4. 測試：上傳 AAB 到「內部測試」，第一次會啟用 Play 應用程式簽署。
   - 2023-11-13 後建立的個人開發者帳號，要先有 12 位以上測試人員加入「封閉測試」並連續 14 天，才能申請正式版。
5. 正式版：送審，審查通常需要幾天。

## iOS：建置與上架

### 有 Mac

```bash
brew install xcodegen
cd EquiLens-App/ios
cp ../../你的/GoogleService-Info.plist EquiLens/
cat > Local.xcconfig <<'EOF'
DEVELOPMENT_TEAM = 你的團隊ID
EQUILENS_RELAY_URL = https:/$()/equilens-push-relay.你的帳號.workers.dev/v1/send
EOF
xcodegen && open EquiLens.xcodeproj
```

需要 Xcode 26 以上（2026-04-28 起，App Store 只接受以 iOS 26 SDK 建置的 App）。在 Xcode 選「Product → Archive」，然後按「Distribute App → App Store Connect」上傳。

### 沒有 Mac：GitHub Actions

1. 在 App Store Connect 的「使用者與存取權限 → 整合 → App Store Connect API」建立金鑰（角色 App Manager），然後設定秘密：

   | 名稱 | 內容 |
   |---|---|
   | `APPLE_TEAM_ID` | 開發者團隊 ID |
   | `ASC_KEY_ID`、`ASC_ISSUER_ID` | API 金鑰 ID 與 Issuer ID |
   | `ASC_KEY_P8_BASE64` | .p8 金鑰檔的 base64 |
   | `GOOGLE_SERVICE_INFO_PLIST_BASE64` | `GoogleService-Info.plist` 的 base64 |

   變數 `EQUILENS_RELAY_URL` 同 Android。
2. 執行「Actions → App · iOS」：
   - 每次都會先編譯模擬器版本，確認程式正確。
   - 設定了 API 金鑰時，會再封存、自動簽署並上傳到 App Store Connect，處理完成後出現在 TestFlight。

### App Store Connect

1. 新增 App：Bundle ID 同上（自動簽署會在開發者網站註冊並開啟推播功能）、主要語言繁體中文、SKU 自訂。
2. 填入商店資料：
   - 文字取自 `store/listing.md`。
   - 截圖：iPhone 6.9 吋 `store/screenshots/ios-iphone-6.9/`、iPad 13 吋 `store/screenshots/ios-ipad-13/`。
3. 填寫 App 隱私權、年齡分級、審查備註（示意模式），答案見 `store/review.md`。
4. 選擇 TestFlight 上的建置版本，送出審查。

## 示意模式與上架素材

- `web/demo/demo-api.json` 是審查人員在示意模式看到的資料。
  - 手機版畫面有大改動時，用示意資料啟動 Nexus 與 Pocket（見 `EquiLens-Nexus/tools/screenshots/README.md`），再執行：

    ```bash
    PLAYWRIGHT=$(npm root -g)/playwright/index.mjs node tools/record-demo.mjs   # 約 10 分鐘
    ```

  - 示意資料離線執行，5 分 K、主力分點與大戶持股只錄自選股；其他股票的這幾項會顯示「示意模式沒有這項資料」。時光機不提供。
  - 焦點頁的新聞與本周大事紀來自 `tools/demo-extras.mjs` 的合成內容（標題標示「【示意】」，連結指向衡析的說明文件）。只改這部分時執行 `node tools/demo-extras.mjs`，不必重新錄製。
- 在電腦瀏覽器預覽示意模式與連線頁：`node tools/preview.mjs`，開 `http://127.0.0.1:4395/`（示意模式）或 `/launcher/index.html`（連線頁）。預覽沒有 App 的原生功能。
- `node tools/store-assets.mjs` 會重新產生 `store/assets/` 的圖示與主題圖片（也會更新 iOS 的 App 圖示），以及 `store/screenshots/` 的四組截圖：

  | 資料夾 | 尺寸 | 用途 |
  |---|---|---|
  | `play-phone` | 1080×1920 | Play 手機 |
  | `play-tablet` | 1920×1200 | Play 平板 |
  | `ios-iphone-6.9` | 1320×2868 | App Store iPhone 6.9 吋 |
  | `ios-ipad-13` | 2064×2752 | App Store iPad 13 吋 |

- 示意資料的查詢規則有三份實作（`tools/demo-keys.mjs`、Android `DemoServer.kt`、iOS `DemoServer.swift`），修改時要一起改並跑測試。

## 測試

```bash
cd EquiLens-App && npm test                         # 推播中繼、示意資料查詢規則
cd EquiLens-App/android && ./gradlew testDebugUnitTest bundleRelease
```

iOS 由 GitHub Actions 在 Mac 主機編譯。

## 審查可能遇到的問題

- **Apple 4.2「最低功能」**：只是把網站包成 App 的應用程式可能被退件。
  - 衡析 App 的定位是自架伺服器的用戶端，類似 Home Assistant 等 App。它也有原生推播、分享與存圖、螢幕恆亮、摺疊與平板版面，以及完整的離線示意模式。
  - 若被退件，在 Resolution Center 說明這是使用者自架、開放原始碼伺服器的用戶端，並請審查人員使用示意模式。
- **需要登入的 App**：Apple 要求提供示範帳號或示意模式。審查備註已說明示意模式。
- **金融類**：App 不提供下單、交易或投資建議，只是研究資訊。商店說明與 App 內都有聲明。
- **資料授權**：行情資料由使用者自己的電腦向使用者自己申請的資料源取得，App 與發行者不轉發資料。
