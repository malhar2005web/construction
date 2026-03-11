from flask import Flask, request, jsonify
from flask_cors import CORS
import sqlite3
import cv2
import numpy as np
import base64
from werkzeug.security import generate_password_hash, check_password_hash
from ultralytics import YOLO

app = Flask(__name__)
CORS(app, resources={r"/api/*": {"origins": "*"}}, supports_credentials=True)

DB_PATH = 'plant_management.db'

def init_db():
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS contractor_data (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            plant_name TEXT NOT NULL,
            section TEXT NOT NULL,
            material TEXT,
            length REAL,
            width REAL,
            pit_depth REAL,
            density REAL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS volume_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            section_id INTEGER,
            volume REAL,
            weight_ton REAL,
            frontal_area REAL,
            img_original TEXT,
            img_grayscale TEXT,
            img_blur TEXT,
            img_mask TEXT,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(section_id) REFERENCES contractor_data(id)
        )
    ''')
    conn.commit()
    conn.close()

def encode_image(img):
    _, buffer = cv2.imencode('.jpg', img)
    return base64.b64encode(buffer).decode('utf-8')

# ── AUTH ─────────────────────────────────────────────────────────────────────

@app.route('/api/signup', methods=['POST'])
def signup():
    data = request.json
    email = data.get('email')
    password = data.get('password')
    if not email or not password:
        return jsonify({"error": "Missing credentials"}), 400
    hashed_password = generate_password_hash(password)
    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        cursor.execute('INSERT INTO users (email, password) VALUES (?, ?)', (email, hashed_password))
        conn.commit()
        conn.close()
        return jsonify({"success": True, "message": "User created successfully"})
    except sqlite3.IntegrityError:
        return jsonify({"error": "Email already exists"}), 400

@app.route('/api/login', methods=['POST'])
def login():
    data = request.json
    email = data.get('email')
    password = data.get('password')
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    cursor.execute('SELECT * FROM users WHERE email = ?', (email,))
    user = cursor.fetchone()
    conn.close()
    if user and check_password_hash(user['password'], password):
        return jsonify({"success": True, "user": {"id": user['id'], "email": user['email']}})
    else:
        return jsonify({"error": "Invalid email or password"}), 401

# ── PLANTS / SECTIONS ─────────────────────────────────────────────────────────

@app.route('/api/plants', methods=['GET'])
def get_plants():
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute('SELECT DISTINCT plant_name FROM contractor_data')
    plants = [row[0] for row in cursor.fetchall()]
    conn.close()
    return jsonify(plants)

@app.route('/api/sections/<plant_name>', methods=['GET'])
def get_sections(plant_name):
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    cursor.execute('SELECT * FROM contractor_data WHERE plant_name = ?', (plant_name,))
    sections = [dict(row) for row in cursor.fetchall()]
    conn.close()
    return jsonify(sections)

@app.route('/api/contractor', methods=['POST'])
def save_contractor():
    data = request.json
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute('''
        INSERT INTO contractor_data (plant_name, section, material, length, width, pit_depth, density)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    ''', (
        data['plantName'], data['section'],
        data.get('material', ''),
        data['length'], data['width'], data['pitDepth'],
        data.get('density', 1600)
    ))
    conn.commit()
    conn.close()
    return jsonify({"success": True})

# ── IMAGE PROCESSING ──────────────────────────────────────────────────────────

@app.route('/api/process-image', methods=['POST'])
def process_image_api():
    data = request.json
    image_b64 = data.get('image').split(',')[-1]
    wall_height = float(data.get('wall_height') if data.get('wall_height') is not None else 5.0)
    pit_width   = float(data.get('pit_width') if data.get('pit_width') is not None else 6.0)
    density     = float(data.get('density') if data.get('density') is not None else 1600.0)

    nparr = np.frombuffer(base64.b64decode(image_b64), np.uint8)
    img   = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    if img is None:
        return jsonify({"error": "Invalid image"}), 400

    # 1. Grayscale
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)

    # 2. Gaussian Blur
    blur = cv2.GaussianBlur(img, (7, 7), 0)

    # 3. HSV initial mask
    hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
    cv2.inRange(hsv, np.array([0, 0, 20]), np.array([180, 80, 200]))

    # 4. GrabCut segmentation
    h, w = img.shape[:2]
    bgd_model = np.zeros((1, 65), np.float64)
    fgd_model = np.zeros((1, 65), np.float64)
    rect      = (int(w * 0.05), int(h * 0.2), int(w * 0.9), int(h * 0.75))
    gc_mask   = np.zeros(img.shape[:2], np.uint8)
    cv2.grabCut(img, gc_mask, rect, bgd_model, fgd_model, 5, cv2.GC_INIT_WITH_RECT)
    final_mask = np.where((gc_mask == 2) | (gc_mask == 0), 0, 1).astype('uint8') * 255

    # 5. Morphological cleanup
    kernel     = np.ones((11, 11), np.uint8)
    final_mask = cv2.morphologyEx(final_mask, cv2.MORPH_CLOSE, kernel)
    final_mask = cv2.morphologyEx(final_mask, cv2.MORPH_OPEN,  kernel)

    # 6. Keep largest contour in lower 2/3
    contours, _ = cv2.findContours(final_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    final_mask   = np.zeros(img.shape[:2], dtype=np.uint8)
    if contours:
        for cnt in sorted(contours, key=cv2.contourArea, reverse=True):
            M = cv2.moments(cnt)
            if M["m00"] > 0 and int(M["m01"] / M["m00"]) > h / 3:
                cv2.drawContours(final_mask, [cnt], -1, 255, thickness=cv2.FILLED)
                break

    # 7. Volume calculation via vertical slicing
    h, w = final_mask.shape
    heights = []
    for x in range(w):
        ys = np.where(final_mask[:, x] == 255)[0]
        heights.append(h - np.min(ys) if len(ys) > 0 else 0)
    heights      = np.array(heights)
    heights_m    = heights * (wall_height / h)
    frontal_area = np.sum(heights_m * (pit_width / w))
    section_breadth  = float(data.get('section_breadth') if data.get('section_breadth') is not None else 1.0)
    volume = frontal_area * section_breadth * 0.5
    weight = volume * density

    # 8. Encode all output images
    overlay = img.copy()
    overlay[final_mask == 0] = (overlay[final_mask == 0] * 0.3).astype(np.uint8)

    return jsonify({
        "grayscale":   encode_image(gray),
        "blur":        encode_image(cv2.cvtColor(blur, cv2.COLOR_BGR2RGB)),
        "mask":        encode_image(final_mask),
        "overlay":     encode_image(overlay),
        "original":    image_b64,
        "frontal_area": round(frontal_area, 2),
        "volume":       round(volume, 2),
        "weight_ton":   round(weight / 1000, 2),
        "success": True
    })

# ── GATE DETECTION ────────────────────────────────────────────────────────────

GATE_MODEL_PATH = r'c:\Users\Malhar\OneDrive\Desktop\New folder (7)\my_model_2_extracted\my_model\weights\best.pt'
gate_model = None
try:
    gate_model = YOLO(GATE_MODEL_PATH)
    print("✅ Gate Material YOLO Model loaded successfully.")
except Exception as e:
    print(f"⚠️ Warning: Could not load gate model: {e}")

@app.route('/api/detect-gate-material', methods=['POST'])
def detect_gate_material():
    if not gate_model:
        return jsonify({"error": "Gate model not loaded on server."}), 500
        
    data = request.json
    try:
        image_b64 = data.get('image').split(',')[-1]
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
                "confidence": round(conf * 100, 2)
            })
            
        return jsonify({
            "success": True,
            "image_with_bboxes": encode_image(plotted_img),
            "detections": detections,
            "original": image_b64
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# ── LOGS ──────────────────────────────────────────────────────────────────────

@app.route('/api/user', methods=['POST'])
def save_log():
    data = request.json
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute('''
        INSERT INTO volume_logs
          (section_id, volume, weight_ton, frontal_area,
           img_original, img_grayscale, img_blur, img_mask)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ''', (
        data['section_id'],
        data['volume'],
        data['weight_ton'],
        data.get('frontal_area', 0),
        data.get('img_original', ''),
        data.get('img_grayscale', ''),
        data.get('img_blur', ''),
        data.get('img_mask', '')
    ))
    conn.commit()
    conn.close()
    return jsonify({"success": True})

@app.route('/api/stats/<section_id>', methods=['GET'])
def get_stats(section_id):
    """Summary list — no images (keeps response small)."""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    cursor.execute('''
        SELECT id, section_id, volume, weight_ton, frontal_area, timestamp
        FROM volume_logs
        WHERE section_id = ?
        ORDER BY timestamp DESC
        LIMIT 20
    ''', (section_id,))
    logs = [dict(row) for row in cursor.fetchall()]
    conn.close()
    return jsonify(logs)

@app.route('/api/scan/<log_id>', methods=['GET'])
def get_scan_detail(log_id):
    """Full detail including all preprocessing images for a past scan."""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    cursor.execute('SELECT * FROM volume_logs WHERE id = ?', (log_id,))
    row = cursor.fetchone()
    conn.close()
    if not row:
        return jsonify({"error": "Scan not found"}), 404
    return jsonify(dict(row))

# ── STARTUP ───────────────────────────────────────────────────────────────────

def run_app():
    init_db()
    print("✅ Backend Server running on http://localhost:5000")
    app.run(port=5000, host='0.0.0.0', debug=False, use_reloader=False)

if __name__ == '__main__':
    run_app()
