# 審查說明、資料安全與分級（Google Play／App Store）

## 給審查人員的說明（App Review Notes／Play「應用程式存取權」）

App Store Connect 的「App 審查資訊 → 備註」與 Play Console 的「應用程式內容 → 應用程式存取權」都貼英文版。審查人員看英文。

```
EquiLens is a client for a self-hosted, open-source research server (EquiLens Pocket) that each user runs on their own computer (https://github.com/wakin61043/tw-trading-dashboard). The app has no accounts of its own; users enter the address of their own server and sign in with the password they set there.

To review the app without a server, tap "Try the demo (no computer needed)" on the first screen. Demo mode shows every screen (brief and AI report, market, heatmap, intraday board and radar, day-trade scanner, stocks with charts and order book, patterns, institutional and broker-branch chips, settings) with synthetic sample data bundled in the app. Queries and settings are read-only in demo mode. To leave demo mode, open the menu (top left) → EquiLens App → Switch server / demo.

Push notifications require the user's own server; they are delivered through Firebase Cloud Messaging via a small relay we operate, which does not store messages or tokens.

The app is a research tool. It does not place orders, does not trade securities and gives no investment advice.
```

如果要讓審查人員連線到真實的衡析，可以另外開一個示意伺服器（例如以示意資料執行的 Nexus＋Pocket，用 Cloudflare 固定網域），在備註補上網址與示意密碼。一般不需要，示意模式已涵蓋所有畫面。

## App 內容與分級

| 項目 | 回答 |
|---|---|
| 目標年齡（Play） | 18 歲以上 |
| 分級問卷（Play IARC） | 類別選「參考資料、新聞或教育」或「工具」；沒有暴力、性、毒品、賭博、使用者互動 |
| 年齡分級（App Store） | 各項都選「無」；「無限制的網頁存取」選「否」（只連使用者自己的伺服器，外部連結用系統瀏覽器開啟） |
| 廣告 | 沒有 |
| 金融功能（Play「金融功能聲明」） | 不提供個人貸款、交易、加密貨幣或其他金融服務，只是研究資訊與通知 |
| 新聞 App（Play） | 不是新聞 App（新聞只是研究資料的一部分） |
| 政府 App | 不是 |
| 健康 | 不是 |

## Google Play「資料安全性」

| 問題 | 回答 |
|---|---|
| 是否收集或分享使用者資料 | 是：收集「裝置或其他 ID」 |
| 收集的資料 | 裝置或其他 ID（推播 token）。用途：「應用程式功能」。暫時處理（ephemeral）：是。必填或選填：選填（使用者開啟通知時） |
| 分享給第三方 | 否（推播中繼與 Firebase 是代表開發者處理資料的服務供應商，不算分享） |
| 傳輸加密 | 是（HTTPS） |
| 使用者能否要求刪除 | 是：關閉通知或解除安裝即刪除；開發者不保存資料 |
| 其他資料類型（位置、個人資訊、財務資訊、相片、App 活動、網頁瀏覽記錄等） | 不收集 |

說明：使用者在 App 中看的研究資料來自使用者自己的電腦，不經過開發者；依 Play 的定義，傳到使用者自己伺服器的資料不算開發者收集。

## App Store「App 隱私權」

| 問題 | 回答 |
|---|---|
| 是否收集資料 | 是 |
| 資料類型 | 「識別碼 → 裝置 ID」（推播 token） |
| 用途 | App 功能 |
| 是否與使用者身分連結 | 否 |
| 是否用於追蹤 | 否 |

`EquiLens-App/ios/EquiLens/PrivacyInfo.xcprivacy` 已宣告相同內容，以及讀寫 UserDefaults 的原因代碼 CA92.1。

## 出口合規（App Store）

只使用作業系統內建的 HTTPS 加密，Info.plist 已設定 `ITSAppUsesNonExemptEncryption = NO`，上傳時不需要另外回答加密問題。
