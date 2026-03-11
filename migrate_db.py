import sqlite3
import firebase_admin
from firebase_admin import credentials, firestore

# Before running this in the future, you need to download your Firebase Admin SDK json
# and save it as "firebase_credentials.json" in this directory.

DB_PATH = 'plant_management.db'
CREDENTIALS_FILE = 'firebase_credentials.json'

def migrate_to_firebase():
    try:
        cred = credentials.Certificate(CREDENTIALS_FILE)
        firebase_admin.initialize_app(cred)
    except FileNotFoundError:
        print(f"Error: {CREDENTIALS_FILE} not found!")
        print("Please place your Firebase Admin SDK JSON key file in this folder and try again.")
        return

    db = firestore.client()
    
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()

    print("Starting migration to Firebase...")

    # 1. Users
    cursor.execute("SELECT * FROM users")
    users = cursor.fetchall()
    print(f"Migrating {len(users)} users...")
    for user in users:
        user_dict = dict(user)
        user_id = str(user_dict.pop('id'))
        db.collection('users').document(user_id).set(user_dict)

    # 2. Contractor Data
    cursor.execute("SELECT * FROM contractor_data")
    contractors = cursor.fetchall()
    
    # Store old ID to new ID mapping (in cases where we might let Firestore auto-generate IDs)
    # But for simplicity, we'll use the SQLite integer ID as the string document ID
    print(f"Migrating {len(contractors)} contractor records...")
    for c in contractors:
        c_dict = dict(c)
        c_id = str(c_dict.pop('id'))
        db.collection('contractor_data').document(c_id).set(c_dict)

    # 3. Volume Logs
    cursor.execute("SELECT * FROM volume_logs")
    logs = cursor.fetchall()
    print(f"Migrating {len(logs)} volume logs...")
    for log in logs:
        log_dict = dict(log)
        log_id = str(log_dict.pop('id'))
        log_dict['section_id'] = str(log_dict['section_id']) # Convert foreign key to string
        db.collection('volume_logs').document(log_id).set(log_dict)

    print("Migration finished completely!")
    conn.close()

if __name__ == "__main__":
    migrate_to_firebase()
