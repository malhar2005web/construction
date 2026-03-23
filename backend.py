from flask import Flask, request, jsonify
from flask_cors import CORS
import cv2
import numpy as np
import base64
from werkzeug.security import generate_password_hash, check_password_hash
from ultralytics import YOLO
import os
from datetime import datetime
from supabase import create_client, Client

# Set environment to prevent GUI issues in non-interactive environments
os.environ['QT_QPA_PLATFORM'] = 'offscreen'
os.environ['TF_CPP_MIN_LOG_LEVEL'] = '2'

app = Flask(__name__)
CORS(app, resources={r"/api/*": {"origins": "*"}}, supports_credentials=True)

# Supabase Credentials
SUPABASE_URL = "https://eaztqygthkxwvgdspmnw.supabase.co"
SUPABASE_KEY = "sb_publishable_FVWqoGatXU7yPkHXRdGBYg_-LV-VCi-"
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

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
    
    # Check if email exists
    try:
        res = supabase.table('users').select('*').eq('email', email).execute()
        if len(res.data) > 0:
            return jsonify({"error": "Email already exists"}), 400
    except Exception as e:
        return jsonify({"error": str(e)}), 500

    hashed_password = generate_password_hash(password)
    try:
        supabase.table('users').insert({
            "email": email,
            "password": hashed_password
        }).execute()
        return jsonify({"success": True, "message": "User created successfully"})
    except Exception as e:
        return jsonify({"error": "Failed to create user", "details": str(e)}), 500


@app.route('/api/login', methods=['POST'])
def login():
    data = request.json
    email = data.get('email')
    password = data.get('password')
    
    try:
        res = supabase.table('users').select('*').eq('email', email).limit(1).execute()
        
        if not res.data:
            return jsonify({"error": "Invalid email or password"}), 401
            
        user = res.data[0]
        
        if check_password_hash(user.get('password', ''), password):
            return jsonify({"success": True, "user": {"id": user['id'], "email": user['email']}})
        else:
            return jsonify({"error": "Invalid email or password"}), 401
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# ── PLANTS / SECTIONS ─────────────────────────────────────────────────────────

@app.route('/api/plants', methods=['GET'])
def get_plants():
    try:
        res = supabase.table('contractor_data').select('plant_name').execute()
        # Extract unique plant names
        plants = list(set([doc['plant_name'] for doc in res.data if 'plant_name' in doc]))
        return jsonify(plants)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/sections/<plant_name>', methods=['GET'])
def get_sections(plant_name):
    try:
        res = supabase.table('contractor_data').select('*').eq('plant_name', plant_name).execute()
        return jsonify(res.data)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/contractor', methods=['POST'])
def save_contractor():
    data = request.json
    try:
        supabase.table('contractor_data').insert({
            "plant_name": data['plantName'],
            "section": data['section'],
            "material": data.get('material', ''),
            "length": data['length'],
            "width": data['width'],
            "pit_depth": data['pitDepth'],
            "density": data.get('density', 1600)
        }).execute()
        return jsonify({"success": True})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# ── IMAGE PROCESSING ──────────────────────────────────────────────────────────

@app.route('/api/process-image', methods=['POST'])
def process_image_api():
    data = request.json
    image_b64 = data.get('image', '').split(',')[-1]
    wall_height = float(data.get('wall_height') if data.get('wall_height') is not None else 5.0)
    pit_width   = float(data.get('pit_width') if data.get('pit_width') is not None else 6.0)
    density     = float(data.get('density') if data.get('density') is not None else 1600.0)

    try:
        nparr = np.frombuffer(base64.b64decode(image_b64), np.uint8)
        img   = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        if img is None: raise ValueError("Invalid image")
    except Exception as e:
        return jsonify({"error": "Invalid image format"}), 400

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
    frontal_area = float(np.sum(heights_m * (float(pit_width) / float(w))))
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
        "frontal_area": float(f"{frontal_area:.2f}"),
        "volume":       float(f"{volume:.2f}"),
        "weight_ton":   float(f"{(weight / 1000.0):.2f}"),
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

# ── LOGS ──────────────────────────────────────────────────────────────────────

@app.route('/api/user', methods=['POST'])
def save_log():
    data = request.json
    try:
        if not data.get('section_id'):
            return jsonify({"error": "Missing section_id"}), 400
            
        supabase.table('volume_logs').insert({
            "section_id": int(data['section_id']),
            "volume": float(data.get('volume', 0)),
            "weight_ton": float(data.get('weight_ton', 0)),
            "frontal_area": float(data.get('frontal_area', 0)),
            "img_original": data.get('img_original', ''),
            "img_grayscale": data.get('img_grayscale', ''),
            "img_blur": data.get('img_blur', ''),
            "img_mask": data.get('img_mask', '')
        }).execute()
        return jsonify({"success": True})
    except Exception as e:
        print(f"❌ Save Log Error: {e}")
        return jsonify({"error": str(e)}), 500

@app.route('/api/stats/<section_id>', methods=['GET'])
def get_stats(section_id):
    """Summary list — no images (keeps response small)."""
    try:
        # We need to sort by timestamp DESC. Supabase provides .order()
        res = supabase.table('volume_logs')\
            .select('id, section_id, volume, weight_ton, frontal_area, timestamp')\
            .eq('section_id', int(section_id))\
            .order('timestamp', desc=True)\
            .limit(20)\
            .execute()
        return jsonify(res.data)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/scan/<log_id>', methods=['GET'])
def get_scan_detail(log_id):
    """Full detail including all preprocessing images for a past scan."""
    try:
        res = supabase.table('volume_logs').select('*').eq('id', int(log_id)).execute()
        if not res.data:
            return jsonify({"error": "Scan not found"}), 404
        return jsonify(res.data[0])
    except Exception as e:
        print(f"❌ Scan Detail Error: {e}")
        return jsonify({"error": str(e)}), 500

# ── MATERIAL LIBRARY ─────────────────────────────────────────────────────────

@app.route('/api/materials', methods=['GET'])
def get_materials():
    try:
        res = supabase.table('material_library').select('*').execute()
        return jsonify(res.data)
    except Exception:
        # Fallback to defaults if table doesn't exist
        return jsonify([
            {"name": "10mm Aggregate"},
            {"name": "20mm Aggregate"},
            {"name": "Coarse Sand"},
            {"name": "Natural Sand"}
        ])

@app.route('/api/materials', methods=['POST'])
def add_material():
    data = request.json
    try:
        supabase.table('material_library').insert({"name": data['name']}).execute()
        return jsonify({"success": True})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# ── DATA MANAGEMENT ──────────────────────────────────────────────────────────

@app.route('/api/log/<log_id>', methods=['DELETE'])
def delete_log(log_id):
    try:
        supabase.table('volume_logs').delete().eq('id', log_id).execute()
        return jsonify({"success": True, "message": "Log deleted"})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/plant-report/<plant_name>', methods=['GET'])
def get_plant_report(plant_name):
    """Aggregated data for all sections of a plant."""
    try:
        # 1. Get all sections for this plant
        sections_res = supabase.table('contractor_data').select('id, section').eq('plant_name', plant_name).execute()
        section_ids = [s['id'] for s in sections_res.data]
        
        if not section_ids:
             return jsonify({
                "plant": plant_name,
                "sections": [],
                "recent_logs": []
            })
        
        # 2. Get latest logs for these IDs
        logs_res = supabase.table('volume_logs').select('*').in_('section_id', section_ids).order('timestamp', desc=True).execute()
        
        return jsonify({
            "plant": plant_name,
            "sections": sections_res.data,
            "recent_logs": logs_res.data
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# ── STARTUP ───────────────────────────────────────────────────────────────────

def run_app():
    print("✅ Backend Server running on http://localhost:5000")
    app.run(port=5000, host='0.0.0.0', debug=False, use_reloader=False)

if __name__ == '__main__':
    run_app()

