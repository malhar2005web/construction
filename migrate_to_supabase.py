import sqlite3
import os
from supabase import create_client, Client

DB_PATH = 'plant_management.db'

# Supabase credentials
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
            existing = supabase.table('users').select('id').eq('email', u_dict['email']).execute()
            if not existing.data:
                supabase.table('users').insert(u_dict).execute()
        print("  Users migrated.")
    except Exception as e:
        print(f"Error migrating users: {e}")

    # 2. Contractor Data
    try:
        cursor.execute("SELECT * FROM contractor_data")
        contractors = cursor.fetchall()
        print(f"Migrating {len(contractors)} contractor records...")
        for c in contractors:
            c_dict = dict(c)
            existing = supabase.table('contractor_data').select('id').eq('id', c_dict['id']).execute()
            if not existing.data:
                supabase.table('contractor_data').insert(c_dict).execute()
        print("  Contractor data migrated.")
    except Exception as e:
        print(f"Error migrating contractor_data: {e}")

    # 3. Volume Logs
    try:
        cursor.execute("SELECT * FROM volume_logs")
        logs = cursor.fetchall()
        print(f"Migrating {len(logs)} volume logs...")
        for log in logs:
            l_dict = dict(log)
            # TUNE: Remove columns that might not exist in Supabase schema or cause issues
            l_dict.pop('image_path', None) 
            
            existing = supabase.table('volume_logs').select('id').eq('id', l_dict['id']).execute()
            if not existing.data:
                supabase.table('volume_logs').insert(l_dict).execute()
        print("  Volume logs migrated.")
    except Exception as e:
        print(f"Error migrating volume_logs: {e}")

    print("Migration finished completely!")
    conn.close()

if __name__ == "__main__":
    migrate_to_supabase()
