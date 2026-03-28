# Construction Mobile App

React Native Expo app with a Flask backend for construction inventory, section setup, measurement logging, and gate material detection.

## App Config

The mobile app reads its backend URL from `EXPO_PUBLIC_API_URL`.

Current production value:

```env
EXPO_PUBLIC_API_URL=https://api.moviemate.in
```

Config flow:

- `.env` for local development
- `app.config.js` injects the value into Expo `extra.apiBaseUrl`
- `eas.json` sets the same variable for the `preview` cloud build profile

If the backend domain changes later, update:

1. `.env`
2. `eas.json`
3. server DNS/nginx/SSL
4. rebuild the APK

## Backend Deploy

Production API is exposed at:

```text
https://api.moviemate.in/api
```

Server flow:

1. DNS `A` record for `api.moviemate.in` points to the backend server IP.
2. `nginx` proxies requests to the Flask app on `127.0.0.1:8000`.
3. `certbot` manages the TLS certificate for `api.moviemate.in`.

Quick verify:

```bash
curl https://api.moviemate.in/api/plants
```

## Build

Install dependencies and trigger the Android APK build:

```bash
npm install
npx eas-cli build -p android --profile preview
```

If PowerShell blocks `npm` or `npx` wrappers on Windows, use:

```powershell
npm.cmd install
npx.cmd eas-cli build -p android --profile preview
```

## Notes

- The app previously failed on Android because it was using a raw `http` IP endpoint instead of a trusted `https` domain.
- `app.json` no longer hardcodes the production API host.
- The mobile runtime falls back to `http://127.0.0.1:8000/api` only when no Expo config value is present.
