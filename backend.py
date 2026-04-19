from contextlib import contextmanager
from datetime import datetime
from functools import wraps
import base64
import hashlib
import hmac
import json
import os
import time

import cv2
from flask import Flask, g, jsonify, request
from flask_cors import CORS
import numpy as np
from dotenv import load_dotenv
import psycopg2
from psycopg2.extras import Json, RealDictCursor
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
APP_SECRET = os.getenv("APP_SECRET", os.getenv("SECRET_KEY", "construction-dev-secret"))
AUTH_TOKEN_MAX_AGE_SECONDS = int(os.getenv("AUTH_TOKEN_MAX_AGE_SECONDS", str(7 * 24 * 60 * 60)))

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


def ensure_audit_table():
    execute_write(
        '''
        CREATE TABLE IF NOT EXISTS audit_logs (
            id serial primary key,
            user_id integer references users(id) on delete set null,
            event_type text not null,
            entity_type text,
            entity_id text,
            description text not null,
            metadata jsonb not null default '{}'::jsonb,
            ip_address text,
            user_agent text,
            created_at timestamp with time zone default now()
        )
        '''
    )
    execute_write(
        'CREATE INDEX IF NOT EXISTS idx_audit_logs_user_created_at ON audit_logs (user_id, created_at DESC)'
    )
    execute_write(
        'CREATE INDEX IF NOT EXISTS idx_audit_logs_event_created_at ON audit_logs (event_type, created_at DESC)'
    )


def get_request_ip():
    forwarded_for = request.headers.get('X-Forwarded-For', '')
    if forwarded_for:
        return forwarded_for.split(',')[0].strip()
    return request.remote_addr


def base64url_encode(raw_bytes):
    return base64.urlsafe_b64encode(raw_bytes).decode('utf-8').rstrip('=')


def base64url_decode(value):
    padding = '=' * (-len(value) % 4)
    return base64.urlsafe_b64decode(f'{value}{padding}')


def sign_token_payload(encoded_header, encoded_payload):
    return base64url_encode(
        hmac.new(
            APP_SECRET.encode('utf-8'),
            f'{encoded_header}.{encoded_payload}'.encode('utf-8'),
            hashlib.sha256,
        ).digest()
    )


def create_auth_token(user):
    encoded_header = base64url_encode(
        json.dumps({"alg": "HS256", "typ": "CST"}).encode('utf-8')
    )
    encoded_payload = base64url_encode(
        json.dumps({
            "user_id": user["id"],
            "email": user["email"],
            "exp": int(time.time()) + AUTH_TOKEN_MAX_AGE_SECONDS,
        }).encode('utf-8')
    )
    signature = sign_token_payload(encoded_header, encoded_payload)
    return f'{encoded_header}.{encoded_payload}.{signature}'


def extract_auth_token():
    auth_header = request.headers.get('Authorization', '')
    prefix = 'Bearer '
    if auth_header.startswith(prefix):
        return auth_header[len(prefix):].strip()
    return None


def decode_auth_token(token):
    parts = str(token or '').split('.')
    if len(parts) != 3:
        raise ValueError('Invalid authentication token')

    encoded_header, encoded_payload, signature = parts
    expected_signature = sign_token_payload(encoded_header, encoded_payload)
    if not hmac.compare_digest(signature, expected_signature):
        raise ValueError('Invalid authentication token')

    payload = json.loads(base64url_decode(encoded_payload).decode('utf-8'))
    if int(payload.get('exp', 0)) < int(time.time()):
        raise ValueError('Session expired. Please login again.')
    return payload


def authenticate_request():
    token = extract_auth_token()
    if not token:
        return None, (jsonify({"error": "Authentication required"}), 401)

    try:
        payload = decode_auth_token(token)
    except ValueError as exc:
        return None, (jsonify({"error": str(exc)}), 401)

    user = fetch_one(
        'SELECT id, email FROM users WHERE id = %s LIMIT 1',
        (payload.get('user_id'),),
    )
    if not user:
        return None, (jsonify({"error": "User not found"}), 401)
    return user, None


def require_auth(route_handler):
    @wraps(route_handler)
    def wrapped(*args, **kwargs):
        user, error_response = authenticate_request()
        if error_response:
            return error_response
        g.current_user = user
        return route_handler(*args, **kwargs)

    return wrapped


def log_audit_event(
    event_type,
    description,
    *,
    user_id=None,
    entity_type=None,
    entity_id=None,
    metadata=None,
):
    try:
        execute_write(
            '''
            INSERT INTO audit_logs
                (user_id, event_type, entity_type, entity_id, description, metadata, ip_address, user_agent)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
            ''',
            (
                user_id,
                event_type,
                entity_type,
                entity_id,
                description,
                Json(metadata or {}),
                get_request_ip(),
                request.headers.get('User-Agent', ''),
            ),
        )
    except Exception as exc:
        print(f"Audit log error [{event_type}]: {exc}")


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
        log_audit_event(
            'auth.signup',
            f'User account created for {email}',
            user_id=user['id'],
            entity_type='user',
            entity_id=user['id'],
            metadata={"email": email},
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
            log_audit_event(
                'auth.login_failed',
                f'Login failed for {email or "unknown email"}',
                entity_type='user',
                metadata={"email": email, "reason": "user_not_found"},
            )
            return jsonify({"error": "Invalid email or password"}), 401

        if check_password_hash(user.get('password', ''), password):
            auth_user = {"id": user['id'], "email": user['email']}
            log_audit_event(
                'auth.login_success',
                f'User logged in: {user["email"]}',
                user_id=user['id'],
                entity_type='user',
                entity_id=user['id'],
                metadata={"email": user['email']},
            )
            return jsonify({
                "success": True,
                "user": auth_user,
                "token": create_auth_token(auth_user),
            })

        log_audit_event(
            'auth.login_failed',
            f'Login failed for {email}',
            entity_type='user',
            metadata={"email": email, "reason": "invalid_password"},
        )
        return jsonify({"error": "Invalid email or password"}), 401
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route('/api/logout', methods=['POST'])
@require_auth
def logout():
    log_audit_event(
        'auth.logout',
        f'User logged out: {g.current_user["email"]}',
        user_id=g.current_user['id'],
        entity_type='user',
        entity_id=g.current_user['id'],
        metadata={"email": g.current_user['email']},
    )
    return jsonify({"success": True})


# PLANTS / SECTIONS

@app.route('/api/plants', methods=['GET'])
@require_auth
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
        log_audit_event(
            'plants.list_viewed',
            'User fetched plant list',
            user_id=g.current_user['id'],
            entity_type='plant',
            metadata={"plant_count": len(plants)},
        )
        return jsonify(plants)
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route('/api/sections/<plant_name>', methods=['GET'])
@require_auth
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
        log_audit_event(
            'sections.viewed',
            f'User viewed sections for plant {plant_name}',
            user_id=g.current_user['id'],
            entity_type='plant',
            entity_id=plant_name,
            metadata={"plant_name": plant_name, "section_count": len(rows)},
        )
        return jsonify(serialize_datetimes(rows))
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route('/api/contractor', methods=['POST'])
@require_auth
def save_contractor():
    data = request.json or {}
    try:
        row = execute_write(
            '''
            INSERT INTO contractor_data
                (plant_name, section, material, length, width, pit_depth, density)
            VALUES (%s, %s, %s, %s, %s, %s, %s)
            RETURNING id, plant_name, section, material
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
            fetch_one_row=True,
        )
        log_audit_event(
            'site.created',
            f'Section {row["section"]} created under plant {row["plant_name"]}',
            user_id=g.current_user['id'],
            entity_type='contractor_data',
            entity_id=row['id'],
            metadata={
                "plant_name": row['plant_name'],
                "section": row['section'],
                "material": row['material'],
            },
        )
        return jsonify({"success": True})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# IMAGE PROCESSING

@app.route('/api/process-image', methods=['POST'])
@require_auth
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

    log_audit_event(
        'scan.image_processed',
        'User processed an image for volumetric analysis',
        user_id=g.current_user['id'],
        entity_type='section',
        entity_id=data.get('section_id'),
        metadata={
            "section_id": data.get('section_id'),
            "material": data.get('material'),
            "frontal_area": float(f"{frontal_area:.2f}"),
            "volume": float(f"{volume:.2f}"),
            "weight_ton": float(f"{(weight_kg / 1000.0):.2f}"),
        },
    )

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
@require_auth
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

        log_audit_event(
            'gate.material_detected',
            'User ran gate material detection',
            user_id=g.current_user['id'],
            entity_type='gate_scan',
            metadata={
                "detections": detections,
                "detection_count": len(detections),
            },
        )

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
@require_auth
def save_log():
    data = request.json or {}
    try:
        if not data.get('section_id'):
            return jsonify({"error": "Missing section_id"}), 400

        row = execute_write(
            '''
            INSERT INTO volume_logs
                (section_id, volume, weight_ton, frontal_area, img_original, img_grayscale, img_blur, img_mask)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
            RETURNING id, section_id, volume, weight_ton, frontal_area, timestamp
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
            fetch_one_row=True,
        )
        log_audit_event(
            'scan.saved',
            f'Scan saved for section {row["section_id"]}',
            user_id=g.current_user['id'],
            entity_type='volume_log',
            entity_id=row['id'],
            metadata={
                "section_id": row['section_id'],
                "volume": row['volume'],
                "weight_ton": row['weight_ton'],
                "frontal_area": row['frontal_area'],
                "timestamp": row['timestamp'].isoformat() if row.get('timestamp') else None,
            },
        )
        return jsonify({"success": True})
    except Exception as e:
        print(f"Save Log Error: {e}")
        return jsonify({"error": str(e)}), 500


@app.route('/api/stats/<section_id>', methods=['GET'])
@require_auth
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
        log_audit_event(
            'scan.history_viewed',
            f'User viewed scan history for section {section_id}',
            user_id=g.current_user['id'],
            entity_type='section',
            entity_id=int(section_id),
            metadata={"section_id": int(section_id), "result_count": len(rows)},
        )
        return jsonify(serialize_datetimes(rows))
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route('/api/scan/<log_id>', methods=['GET'])
@require_auth
def get_scan_detail(log_id):
    try:
        row = fetch_one(
            'SELECT * FROM volume_logs WHERE id = %s',
            (int(log_id),),
        )
        if not row:
            return jsonify({"error": "Scan not found"}), 404
        log_audit_event(
            'scan.detail_viewed',
            f'User viewed scan detail {log_id}',
            user_id=g.current_user['id'],
            entity_type='volume_log',
            entity_id=int(log_id),
            metadata={"section_id": row.get('section_id')},
        )
        return jsonify(serialize_datetimes(row))
    except Exception as e:
        print(f"Scan Detail Error: {e}")
        return jsonify({"error": str(e)}), 500


# MATERIAL LIBRARY

@app.route('/api/materials', methods=['GET'])
@require_auth
def get_materials():
    try:
        rows = fetch_all(
            '''
            SELECT *
            FROM material_library
            ORDER BY created_at DESC, id DESC
            '''
        )
        log_audit_event(
            'materials.list_viewed',
            'User viewed material library',
            user_id=g.current_user['id'],
            entity_type='material_library',
            metadata={"material_count": len(rows)},
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
@require_auth
def add_material():
    data = request.json or {}
    try:
        row = execute_write(
            'INSERT INTO material_library (name) VALUES (%s) RETURNING id, name',
            (data['name'],),
            fetch_one_row=True,
        )
        log_audit_event(
            'materials.created',
            f'Material added: {row["name"]}',
            user_id=g.current_user['id'],
            entity_type='material_library',
            entity_id=row['id'],
            metadata={"name": row['name']},
        )
        return jsonify({"success": True})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# DATA MANAGEMENT

@app.route('/api/log/<log_id>', methods=['DELETE'])
@require_auth
def delete_log(log_id):
    try:
        existing_log = fetch_one(
            'SELECT id, section_id, volume, weight_ton FROM volume_logs WHERE id = %s',
            (int(log_id),),
        )
        execute_write(
            'DELETE FROM volume_logs WHERE id = %s',
            (int(log_id),),
        )
        log_audit_event(
            'scan.deleted',
            f'Scan log deleted: {log_id}',
            user_id=g.current_user['id'],
            entity_type='volume_log',
            entity_id=int(log_id),
            metadata=existing_log or {"log_id": int(log_id)},
        )
        return jsonify({"success": True, "message": "Log deleted"})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route('/api/plant-report/<plant_name>', methods=['GET'])
@require_auth
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

        log_audit_event(
            'plant.report_viewed',
            f'User viewed report for plant {plant_name}',
            user_id=g.current_user['id'],
            entity_type='plant',
            entity_id=plant_name,
            metadata={
                "plant_name": plant_name,
                "section_count": len(sections),
                "log_count": len(logs),
            },
        )

        return jsonify({
            "plant": plant_name,
            "sections": sections,
            "recent_logs": serialize_datetimes(logs)
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route('/api/activity', methods=['POST'])
@require_auth
def save_activity():
    data = request.json or {}
    event_type = data.get('event_type')
    description = data.get('description') or 'User activity captured'
    if not event_type:
        return jsonify({"error": "Missing event_type"}), 400

    metadata = data.get('metadata') or {}
    log_audit_event(
        event_type,
        description,
        user_id=g.current_user['id'],
        entity_type=data.get('entity_type') or 'ui',
        entity_id=data.get('entity_id'),
        metadata=metadata,
    )
    return jsonify({"success": True})


@app.route('/api/activity/heartbeat', methods=['POST'])
@require_auth
def save_heartbeat():
    data = request.json or {}
    log_audit_event(
        'user.heartbeat',
        'User session heartbeat captured',
        user_id=g.current_user['id'],
        entity_type='session',
        metadata={
            "view": data.get('view'),
            "plant_name": data.get('plant_name'),
            "section_id": data.get('section_id'),
            "section_name": data.get('section_name'),
        },
    )
    return jsonify({"success": True})


# STARTUP

def run_app():
    validate_db_config()
    ensure_audit_table()
    print(f"Backend Server running on http://{APP_HOST}:{APP_PORT}")
    app.run(port=APP_PORT, host=APP_HOST, debug=False, use_reloader=False)


if __name__ == '__main__':
    run_app()
