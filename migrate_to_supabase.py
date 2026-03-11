import sqlite3
import os
from supabase import create_client, Client

DB_PATH = 'plant_management.db'

# Use Supabase credentials provided
SUPABASE_URL = "https://eaztqygthkxwvgdspmnw.supabase.co"
SUPABASE_KEY = "sb_publishable_FVWqoGatXU7yPkHXRdGBYg_-LV-VCi-"
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

def migrate_to_supabase():
    if not os.path.exists(DB_PATH):
        print(f"Error: {DB_PATH} not found!")
        return

    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()

    print("Starting migration to Supabase...")

    # 1. Users
    try:
        cursor.execute("SELECT * FROM users")
        users = cursor.fetchall()
        print(f"Migrating {len(users)} users...")
        for user in users:
            u_dict = dict(user)
            u_dict.pop('id', None)  # Let Supabase auto-generate the ID, or we keep it if we want to preserve foreign keys. Wait, volume_logs reference contractor_data.id!
            # For users we can keep ID by supplying it (Postgres allows inserting into SERIAL id if explicitly named)
            supabase.table('users').insert(dict(user)).execute()
    except Exception as e:
        print(f"Error migrating users: {e}")

    # 2. Contractor Data
    try:
        cursor.execute("SELECT * FROM contractor_data")
        contractors = cursor.fetchall()
        print(f"Migrating {len(contractors)} contractor records...")
        for c in contractors:
            supabase.table('contractor_data').insert(dict(c)).execute()
    except Exception as e:
        print(f"Error migrating contractor_data: {e}")

    # 3. Volume Logs
    try:
        cursor.execute("SELECT * FROM volume_logs")
        logs = cursor.fetchall()
        print(f"Migrating {len(logs)} volume logs...")
        for log in logs:
            supabase.table('volume_logs').insert(dict(log)).execute()
    except Exception as e:
        print(f"Error migrating volume_logs: {e}")

    print("Migration finished completely!")
    conn.close()

if __name__ == "__main__":
    migrate_to_supabase()
