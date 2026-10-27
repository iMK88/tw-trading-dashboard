# EquiLens App Privacy Policy

Last updated: 2026-10-27

The EquiLens app is an open-source research tool. It does not provide market data or run an account system. Your data and API keys stay in EquiLens on your own computer. The app connects to that computer through the address you enter.

## What the app handles

| Data | Where it is stored or sent | Purpose |
|---|---|---|
| The EquiLens address you enter and recently used addresses | This phone only | Reconnect automatically |
| Sign-in state (cookie) | This phone and your own computer | Stay signed in, for up to 30 days |
| Push token (Firebase Cloud Messaging token) | Your own computer. When a notification is sent, it also goes to the push relay and to Google's and Apple's push services | Deliver notifications to this phone |
| Notification content (for example stock names, alert conditions, news headlines) | From your computer through the push relay, Google Firebase and Apple's push service to your phone | Show notifications |
| The research data you view in the app | Your own computer | The app screens |

- **The push relay** is operated by the app publisher. It only forwards notifications from your computer to Firebase. It does not store notification content or push tokens; it only counts requests in memory to limit abuse.
- **The push token is used only when notifications are on.** You can turn them off under Live → Radar, or in your phone's settings.
- Market, chip and news data are fetched by your own computer from the data providers you configure (for example FinMind, Fugle, TWSE). The publisher cannot access them.

## What the app does not do

- It does not collect your name, email, location, contacts or photos.
  - When you save a report card, the image is written to your photo library (Android) or handed to the system share sheet (iPhone). The app does not read your photos.
- It shows no ads.
- It contains no analytics or tracking SDKs.
- It does not track you across apps or websites.
- It does not sell or share any data.

## Demo mode

Demo mode uses synthetic sample data built into the app. It connects to no server and sends no data.

## Third-party services

| Service | Purpose | Privacy policy |
|---|---|---|
| Google Firebase Cloud Messaging | Push notifications | https://firebase.google.com/support/privacy |
| Apple Push Notification service (iPhone) | Push notifications | https://www.apple.com/legal/privacy/ |
| Cloudflare Workers | Runs the push relay | https://www.cloudflare.com/privacypolicy/ |

## Deleting data

- Uninstalling the app removes the addresses, sign-in state and push token from your phone.
- On your computer, you can delete the data in `EquiLens-Pocket/.local/` or turn off notifications for this phone.
- The publisher holds none of your data, so there is nothing else to request.

## Children

EquiLens is a tool for adult investment researchers and is not directed at children.

## Contact and changes

- Report questions at https://github.com/wakin61043/tw-trading-dashboard/issues.
- If this policy changes, the date above is updated and the change is recorded in the changelog.
