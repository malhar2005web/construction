# Vision Inventory - AI-Powered Raw Material Tracking

## Project Overview

An AI-powered system for tracking raw materials in industrial plant settings using computer vision. It calculates volume and weight of materials in storage pits and detects material types at plant gates using YOLO object detection.

## Architecture

### Backend (Flask/Python) — Port 8000
- `backend.py` — Main Flask API server
- Uses Supabase (cloud PostgreSQL) for data storage and auth
- OpenCV for image processing and volumetric analysis
- YOLO (ultralytics) for gate material detection (disabled if torch not installed)
- Runs on `localhost:8000`

### Frontend (React + Vite) — Port 5000
- `frontend-react/` — Web dashboard (Security Portal)
- Connects to backend at `http://localhost:8000/api`
- Runs on `0.0.0.0:5000`

### Mobile App (React Native / Expo)
- `App.js` — Mobile app entry point
- Not configured as a workflow (requires EAS build for Android/iOS)

## Key Files

- `backend.py` — Flask API with Supabase integration
- `frontend-react/src/App.jsx` — Main React web app
- `frontend-react/vite.config.js` — Vite config (host: 0.0.0.0, port: 5000, allowedHosts: true)
- `my_model_2_extracted/my_model/weights/best.pt` — YOLO model weights
- `requirements.txt` — Python dependencies

## Workflows

- **Start application** — `cd frontend-react && npm run dev` (webview, port 5000)
- **Backend API** — `python3 backend.py` (console, port 8000)

## Supabase Configuration

Supabase credentials are hardcoded in `backend.py`:
- URL: `https://eaztqygthkxwvgdspmnw.supabase.co`
- Key: stored in code (publishable key)

## Notes

- `ultralytics` (YOLO/torch) is not installed due to disk quota limitations. Gate detection endpoint returns error gracefully.
- `opencv-python-headless` is used instead of `opencv-python` for server environments.
- The YOLO model path was updated from a Windows absolute path to a relative path.
