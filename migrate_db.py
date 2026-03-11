import sqlite3

DB_PATH = 'plant_management.db'

def migrate():
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    print("Starting migration...")
    
    # contractor_data table
    try:
        cursor.execute("ALTER TABLE contractor_data ADD COLUMN material TEXT")
        print("Added 'material' to contractor_data")
    except sqlite3.OperationalError:
        print("'material' already exists in contractor_data")

    try:
        cursor.execute("ALTER TABLE contractor_data ADD COLUMN density REAL")
        print("Added 'density' to contractor_data")
    except sqlite3.OperationalError:
        print("'density' already exists in contractor_data")

    # volume_logs table
    try:
        cursor.execute("ALTER TABLE volume_logs ADD COLUMN frontal_area REAL")
        print("Added 'frontal_area' to volume_logs")
    except sqlite3.OperationalError:
        print("'frontal_area' already exists in volume_logs")

    try:
        cursor.execute("ALTER TABLE volume_logs ADD COLUMN img_original TEXT")
        print("Added 'img_original' to volume_logs")
    except sqlite3.OperationalError:
        print("'img_original' already exists in volume_logs")

    try:
        cursor.execute("ALTER TABLE volume_logs ADD COLUMN img_grayscale TEXT")
        print("Added 'img_grayscale' to volume_logs")
    except sqlite3.OperationalError:
        print("'img_grayscale' already exists in volume_logs")

    try:
        cursor.execute("ALTER TABLE volume_logs ADD COLUMN img_blur TEXT")
        print("Added 'img_blur' to volume_logs")
    except sqlite3.OperationalError:
        print("'img_blur' already exists in volume_logs")

    try:
        cursor.execute("ALTER TABLE volume_logs ADD COLUMN img_mask TEXT")
        print("Added 'img_mask' to volume_logs")
    except sqlite3.OperationalError:
        print("'img_mask' already exists in volume_logs")

    conn.commit()
    conn.close()
    print("Migration finished!")

if __name__ == "__main__":
    migrate()
