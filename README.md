# Construction Mobile App

React Native Expo app with a hybrid backend:

- Node/Express for auth and CRUD APIs
- Flask/Python for image-processing and detection APIs

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

## Backend Layout

Public API base:

```text
https://api.moviemate.in/api
```

Internal services:

- Node API on `http://127.0.0.1:3000`
- Python API on `http://127.0.0.1:8000`

Node handles:

- `/api/signup`
- `/api/login`
- `/api/plants`
- `/api/sections/:plantName`
- `/api/contractor`
- `/api/user`
- `/api/stats/:sectionId`
- `/api/scan/:logId`
- `/api/materials`
- `/api/log/:logId`
- `/api/plant-report/:plantName`

Python handles:

- `/api/process-image`
- `/api/detect-gate-material`

This keeps database/auth CRUD in Node while leaving computer-vision logic in Python.

## Backend Deploy

Server flow:

1. DNS `A` record for `api.moviemate.in` points to the backend server IP.
2. `nginx` routes CRUD/auth paths to the Node API on `127.0.0.1:3000`.
3. `nginx` routes image-processing paths to the Python API on `127.0.0.1:8000`.
4. `certbot` manages the TLS certificate for `api.moviemate.in`.

Example nginx split:

```nginx
location /api/process-image {
    proxy_pass http://127.0.0.1:8000;
}

location /api/detect-gate-material {
    proxy_pass http://127.0.0.1:8000;
}

location /api/ {
    proxy_pass http://127.0.0.1:3000;
}
```

## Running The Services

Install and run the Node API:

```bash
cd backend-node
npm install
npm start
```

Run the Python API:

```bash
python backend.py
```

Required ports in `.env`:

```env
NODE_API_PORT=3000
APP_PORT=8000
```

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
- Existing Flask-created password hashes remain compatible because the Node API verifies Werkzeug-style `pbkdf2` and `scrypt` hashes.
