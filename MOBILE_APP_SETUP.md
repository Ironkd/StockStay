# Mobile App Setup (iOS & Android)

This app uses [Capacitor](https://capacitorjs.com) to run as native iOS and Android apps.

## Quick Start

```bash
# Build and sync to native projects
npm run cap:sync

# Open in Xcode (iOS) or Android Studio (Android)
npm run cap:ios
npm run cap:android
```

## Prerequisites

- **macOS** for iOS builds (Xcode from Mac App Store)
- **Android Studio** with SDK Platform 33+ (API 36 is fine)
- **Java/JDK** – Android Studio bundles one; if Gradle fails, use **File → Sync Project with Gradle Files** in Android Studio

## API Configuration

Mobile builds use `VITE_API_BASE_URL` from `.env.production` (default: `https://api.stockstay.com/api`). To use a different backend:

1. Edit `.env.production` and set `VITE_API_BASE_URL` to your API base URL.
2. Run `npm run cap:sync` to rebuild and sync.

## CORS

The backend automatically allows Capacitor origins (`capacitor://localhost`, `http://localhost`, `https://localhost`) when `CORS_ORIGIN` is set on Railway. No extra configuration needed.

## Workflow

| Task | Command |
|------|---------|
| Build web + sync to native | `npm run cap:sync` |
| Open iOS in Xcode | `npm run cap:ios` |
| Open Android in Android Studio | `npm run cap:android` |

After changing React code: run `npm run cap:sync` before testing in the simulator/device.
