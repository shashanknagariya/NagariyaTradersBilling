import sqlite3
import os

DB_FILE = "grain_trading_v11.db"

def migrate():
    if not os.path.exists(DB_FILE):
        print(f"Database {DB_FILE} not found. Skipping migration (will be created by app).")
        return

    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    
    columns = [
        ("labour_cost_per_bag", "FLOAT DEFAULT 3.0"),
        ("transport_cost_per_qtl", "FLOAT DEFAULT 0.0"),
        ("labour_cost_total", "FLOAT DEFAULT 0.0"),
        ("expenses_total", "FLOAT DEFAULT 0.0")
    ]
    
    print("Migrating Database...")
    for col, dtype in columns:
        try:
            cursor.execute(f"ALTER TABLE `transaction` ADD COLUMN {col} {dtype}")
            print(f"Added column: {col}")
        except sqlite3.OperationalError as e:
            if "duplicate column" in str(e):
                print(f"Column {col} already exists. Skipping.")
            else:
                print(f"Error adding {col}: {e}")
                
    conn.commit()
    conn.close()
    print("Migration Complete.")

if __name__ == "__main__":
    migrate()
