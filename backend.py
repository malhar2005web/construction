from contextlib import contextmanager
from datetime import datetime
import base64
import os

import cv2
from flask import Flask, jsonify, request
from flask_cors import CORS
import numpy as np
from dotenv import load_dotenv
import psycopg2
from psycopg2.extras import RealDictCursor
from werkzeug.security import check_password_hash, generate_password_hash

try:
    from ultralytics import YOLO
    YOLO_AVAILABLE = True
except ImportError:
    YOLO_AVAILABLE = False
    YOLO = None


# Set environment to prevent GUI issues in non-interactive environments
os.environ['QT_QPA_PLATFORM'] = 'offscreen'
os.environ['TF_CPP_MIN_LOG_LEVEL'] = '2'
load_dotenv()

FRONTEND_DIST = os.path.join(os.path.dirname(__file__), 'frontend-react', 'dist')
app = Flask(__name__, static_folder=FRONTEND_DIST, static_url_path='')
CORS(app, resources={r"/api/*": {"origins": "*"}}, supports_credentials=True)

if os.path.exists(FRONTEND_DIST):
    @app.route('/', defaults={'path': ''})
    @app.route('/<path:path>')
    def serve_frontend(path):
        if path and path.startswith('api'):
            from flask import abort
            abort(404)
        file_path = os.path.join(FRONTEND_DIST, path)
        if path and os.path.exists(file_path):
            return app.send_static_file(path)
        return app.send_static_file('index.html')


DB_CONFIG = {
    "host": os.getenv("POSTGRES_HOST", "127.0.0.1"),
    "port": int(os.getenv("POSTGRES_PORT", "5432")),
    "dbname": os.getenv("POSTGRES_DB", "construction"),
    "user": os.getenv("POSTGRES_USER", "postgres"),
    "password": os.getenv("POSTGRES_PASSWORD"),
}

APP_HOST = os.getenv("APP_HOST", "0.0.0.0")
APP_PORT = int(os.getenv("PORT", os.getenv("APP_PORT", "8000")))

KG_PER_LITER_DEFAULT = 1.6


def validate_db_config():
    missing = [key for key, value in DB_CONFIG.items() if value in (None, "")]
    if missing:
        raise RuntimeError(
            "Missing PostgreSQL configuration for: " + ", ".join(missing)
        )


@contextmanager
def get_db_connection():
    validate_db_config()
    conn = psycopg2.connect(**DB_CONFIG)
    try:
        yield conn
    finally:
        conn.close()


def fetch_all(query, params=None):
    with get_db_connection() as conn:
        with conn.cursor(cursor_factory=RealDictCursor) as cursor:
            cursor.execute(query, params or ())
            return [dict(row) for row in cursor.fetchall()]


def fetch_one(query, params=None):
    with get_db_connection() as conn:
        with conn.cursor(cursor_factory=RealDictCursor) as cursor:
            cursor.execute(query, params or ())
            row = cursor.fetchone()
            return dict(row) if row else None


def execute_write(query, params=None, fetch_one_row=False):
    with get_db_connection() as conn:
        with conn.cursor(cursor_factory=RealDictCursor) as cursor:
            cursor.execute(query, params or ())
            row = dict(cursor.fetchone()) if fetch_one_row else None
            conn.commit()
            return row


def normalize_density_to_kg_per_liter(value):
    density = float(value if value is not None else KG_PER_LITER_DEFAULT)
    # Backward compatibility: old records may still be stored as kg/m^3 (for example 1600).
    return density / 1000.0 if density > 20 else density


def encode_image(img):
    _, buffer = cv2.imencode('.jpg', img)
    return base64.b64encode(buffer).decode('utf-8')


def serialize_datetimes(payload):
    if isinstance(payload, list):
        return [serialize_datetimes(item) for item in payload]
    if isinstance(payload, dict):
        serialized = {}
        for key, value in payload.items():
            if isinstance(value, datetime):
                serialized[key] = value.isoformat()
            else:
                serialized[key] = serialize_datetimes(value)
        return serialized
    return payload


# AUTH

@app.route('/api/signup', methods=['POST'])
def signup():
    data = request.json or {}
    email = data.get('email')
    password = data.get('password')
    if not email or not password:
        return jsonify({"error": "Missing credentials"}), 400

    try:
        existing_user = fetch_one(
            'SELECT id FROM users WHERE email = %s',
            (email,),
        )
        if existing_user:
            return jsonify({"error": "Email already exists"}), 400

        hashed_password = generate_password_hash(password)
        user = execute_write(
            '''
            INSERT INTO users (email, password)
            VALUES (%s, %s)
            RETURNING id, email
            ''',
            (email, hashed_password),
            fetch_one_row=True,
        )
        return jsonify({"success": True, "message": "User created successfully", "user": user})
    except Exception as e:
        return jsonify({"error": "Failed to create user", "details": str(e)}), 500


@app.route('/api/login', methods=['POST'])
def login():
    data = request.json or {}
    email = data.get('email')
    password = data.get('password')

    try:
        user = fetch_one(
            'SELECT id, email, password FROM users WHERE email = %s LIMIT 1',
            (email,),
        )

        if not user:
            return jsonify({"error": "Invalid email or password"}), 401

        if check_password_hash(user.get('password', ''), password):
            return jsonify({"success": True, "user": {"id": user['id'], "email": user['email']}})

        return jsonify({"error": "Invalid email or password"}), 401
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# PLANTS / SECTIONS

@app.route('/api/plants', methods=['GET'])
def get_plants():
    try:
        rows = fetch_all(
            '''
            SELECT DISTINCT plant_name
            FROM contractor_data
            ORDER BY plant_name
            '''
        )
        plants = [row['plant_name'] for row in rows if row.get('plant_name')]
        return jsonify(plants)
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route('/api/sections/<plant_name>', methods=['GET'])
def get_sections(plant_name):
    try:
        rows = fetch_all(
            '''
            SELECT *
            FROM contractor_data
            WHERE plant_name = %s
            ORDER BY id DESC
            ''',
            (plant_name,),
        )
        for row in rows:
            row['density'] = normalize_density_to_kg_per_liter(row.get('density'))
        return jsonify(serialize_datetimes(rows))
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route('/api/contractor', methods=['POST'])
def save_contractor():
    data = request.json or {}
    try:
        execute_write(
            '''
            INSERT INTO contractor_data
                (plant_name, section, material, length, width, pit_depth, density)
            VALUES (%s, %s, %s, %s, %s, %s, %s)
            ''',
            (
                data['plantName'],
                data['section'],
                data.get('material', ''),
                float(data['length']),
                float(data['width']),
                float(data['pitDepth']),
                normalize_density_to_kg_per_liter(data.get('density', KG_PER_LITER_DEFAULT)),
            ),
        )
        return jsonify({"success": True})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# IMAGE PROCESSING

@app.route('/api/process-image', methods=['POST'])
def process_image_api():
    data = request.json or {}
    image_b64 = data.get('image', '').split(',')[-1]
    wall_height = float(data.get('wall_height') if data.get('wall_height') is not None else 5.0)
    pit_width = float(data.get('pit_width') if data.get('pit_width') is not None else 6.0)
    density_kg_per_liter = normalize_density_to_kg_per_liter(data.get('density', KG_PER_LITER_DEFAULT))

    try:
        nparr = np.frombuffer(base64.b64decode(image_b64), np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        if img is None:
            raise ValueError("Invalid image")
    except Exception:
        return jsonify({"error": "Invalid image format"}), 400

    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    blur = cv2.GaussianBlur(img, (7, 7), 0)

    hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
    cv2.inRange(hsv, np.array([0, 0, 20]), np.array([180, 80, 200]))

    h, w = img.shape[:2]
    bgd_model = np.zeros((1, 65), np.float64)
    fgd_model = np.zeros((1, 65), np.float64)
    rect = (int(w * 0.05), int(h * 0.2), int(w * 0.9), int(h * 0.75))
    gc_mask = np.zeros(img.shape[:2], np.uint8)
    cv2.grabCut(img, gc_mask, rect, bgd_model, fgd_model, 5, cv2.GC_INIT_WITH_RECT)
    final_mask = np.where((gc_mask == 2) | (gc_mask == 0), 0, 1).astype('uint8') * 255

    kernel = np.ones((11, 11), np.uint8)
    final_mask = cv2.morphologyEx(final_mask, cv2.MORPH_CLOSE, kernel)
    final_mask = cv2.morphologyEx(final_mask, cv2.MORPH_OPEN, kernel)

    contours, _ = cv2.findContours(final_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    final_mask = np.zeros(img.shape[:2], dtype=np.uint8)
    if contours:
        for cnt in sorted(contours, key=cv2.contourArea, reverse=True):
            moments = cv2.moments(cnt)
            if moments["m00"] > 0 and int(moments["m01"] / moments["m00"]) > h / 3:
                cv2.drawContours(final_mask, [cnt], -1, 255, thickness=cv2.FILLED)
                break

    h, w = final_mask.shape
    heights = []
    for x in range(w):
        ys = np.where(final_mask[:, x] == 255)[0]
        heights.append(h - np.min(ys) if len(ys) > 0 else 0)
    heights = np.array(heights)
    heights_m = heights * (wall_height / h)
    frontal_area = float(np.sum(heights_m * (float(pit_width) / float(w))))
    section_breadth = float(data.get('section_breadth') if data.get('section_breadth') is not None else 1.0)
    volume = frontal_area * section_breadth * 0.5
    weight_kg = volume * 1000.0 * density_kg_per_liter

    overlay = img.copy()
    overlay[final_mask == 0] = (overlay[final_mask == 0] * 0.3).astype(np.uint8)

    return jsonify({
        "grayscale": encode_image(gray),
        "blur": encode_image(cv2.cvtColor(blur, cv2.COLOR_BGR2RGB)),
        "mask": encode_image(final_mask),
        "overlay": encode_image(overlay),
        "original": image_b64,
        "frontal_area": float(f"{frontal_area:.2f}"),
        "volume": float(f"{volume:.2f}"),
        "weight_ton": float(f"{(weight_kg / 1000.0):.2f}"),
        "success": True
    })


# GATE DETECTION

GATE_MODEL_PATH = os.path.join(os.path.dirname(__file__), 'my_model_2_extracted', 'my_model', 'weights', 'best.pt')
gate_model = None
if YOLO_AVAILABLE:
    try:
        gate_model = YOLO(GATE_MODEL_PATH)
        print("Gate Material YOLO Model loaded successfully.")
    except Exception as e:
        print(f"Warning: Could not load gate model: {e}")
else:
    print("Warning: YOLO not available. Gate detection disabled.")


@app.route('/api/detect-gate-material', methods=['POST'])
def detect_gate_material():
    if not gate_model:
        return jsonify({"error": "Gate model not loaded on server."}), 500

    data = request.json or {}
    try:
        image_b64 = data.get('image', '').split(',')[-1]
        nparr = np.frombuffer(base64.b64decode(image_b64), np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        if img is None:
            return jsonify({"error": "Invalid image format"}), 400

        results = gate_model(img)
        result = results[0]
        plotted_img = result.plot()

        detections = []
        for box in result.boxes:
            cls_id = int(box.cls[0].item())
            conf = float(box.conf[0].item())
            class_name = result.names[cls_id]
            detections.append({
                "class": class_name,
                "confidence": float(f"{(conf * 100):.2f}")
            })

        return jsonify({
            "success": True,
            "image_with_bboxes": encode_image(plotted_img),
            "detections": detections,
            "original": image_b64
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# LOGS

@app.route('/api/user', methods=['POST'])
def save_log():
    data = request.json or {}
    try:
        if not data.get('section_id'):
            return jsonify({"error": "Missing section_id"}), 400

        execute_write(
            '''
            INSERT INTO volume_logs
                (section_id, volume, weight_ton, frontal_area, img_original, img_grayscale, img_blur, img_mask)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
            ''',
            (
                int(data['section_id']),
                float(data.get('volume', 0)),
                float(data.get('weight_ton', 0)),
                float(data.get('frontal_area', 0)),
                data.get('img_original', ''),
                data.get('img_grayscale', ''),
                data.get('img_blur', ''),
                data.get('img_mask', ''),
            ),
        )
        return jsonify({"success": True})
    except Exception as e:
        print(f"Save Log Error: {e}")
        return jsonify({"error": str(e)}), 500


@app.route('/api/stats/<section_id>', methods=['GET'])
def get_stats(section_id):
    try:
        rows = fetch_all(
            '''
            SELECT id, section_id, volume, weight_ton, frontal_area, timestamp
            FROM volume_logs
            WHERE section_id = %s
            ORDER BY timestamp DESC
            LIMIT 20
            ''',
            (int(section_id),),
        )
        return jsonify(serialize_datetimes(rows))
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route('/api/scan/<log_id>', methods=['GET'])
def get_scan_detail(log_id):
    try:
        row = fetch_one(
            'SELECT * FROM volume_logs WHERE id = %s',
            (int(log_id),),
        )
        if not row:
            return jsonify({"error": "Scan not found"}), 404
        return jsonify(serialize_datetimes(row))
    except Exception as e:
        print(f"Scan Detail Error: {e}")
        return jsonify({"error": str(e)}), 500


# MATERIAL LIBRARY

@app.route('/api/materials', methods=['GET'])
def get_materials():
    try:
        rows = fetch_all(
            '''
            SELECT *
            FROM material_library
            ORDER BY created_at DESC, id DESC
            '''
        )
        return jsonify(serialize_datetimes(rows))
    except Exception:
        return jsonify([
            {"name": "10mm Aggregate"},
            {"name": "20mm Aggregate"},
            {"name": "Coarse Sand"},
            {"name": "Natural Sand"}
        ])


@app.route('/api/materials', methods=['POST'])
def add_material():
    data = request.json or {}
    try:
        execute_write(
            'INSERT INTO material_library (name) VALUES (%s)',
            (data['name'],),
        )
        return jsonify({"success": True})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# DATA MANAGEMENT

@app.route('/api/log/<log_id>', methods=['DELETE'])
def delete_log(log_id):
    try:
        execute_write(
            'DELETE FROM volume_logs WHERE id = %s',
            (int(log_id),),
        )
        return jsonify({"success": True, "message": "Log deleted"})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route('/api/plant-report/<plant_name>', methods=['GET'])
def get_plant_report(plant_name):
    try:
        sections = fetch_all(
            '''
            SELECT id, section
            FROM contractor_data
            WHERE plant_name = %s
            ORDER BY id DESC
            ''',
            (plant_name,),
        )
        section_ids = [row['id'] for row in sections]

        if not section_ids:
            return jsonify({
                "plant": plant_name,
                "sections": [],
                "recent_logs": []
            })

        logs = fetch_all(
            '''
            SELECT *
            FROM volume_logs
            WHERE section_id = ANY(%s)
            ORDER BY timestamp DESC
            ''',
            (section_ids,),
        )

        return jsonify({
            "plant": plant_name,
            "sections": sections,
            "recent_logs": serialize_datetimes(logs)
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# STARTUP

def run_app():
    validate_db_config()
    print(f"Backend Server running on http://{APP_HOST}:{APP_PORT}")
    app.run(port=APP_PORT, host=APP_HOST, debug=False, use_reloader=False)


if __name__ == '__main__':
    run_app()
