from sqlalchemy import create_engine, text
import os
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")

def migrate():
    if not DATABASE_URL:
        print("CRITICAL ERROR: DATABASE_URL not found in environment variables.")
        return

    # Fix for SQLAlchemy (Postgres dialect)
    db_url = DATABASE_URL
    if db_url.startswith("postgres://"):
        db_url = db_url.replace("postgres://", "postgresql://", 1)

    print(f"Attempting to connect to database...")
    
    try:
        engine = create_engine(db_url)
        with engine.connect() as conn:
            # Transactional execution
            with conn.begin():
                print("Connected. Running Migrations...")
                
                # 1. Add extra_loose_quantity to Transaction
                # Check if column exists
                check_sql = text("SELECT column_name FROM information_schema.columns WHERE table_name='transaction' AND column_name='extra_loose_quantity';")
                result = conn.execute(check_sql).fetchone()
                
                if result:
                    print("Column 'extra_loose_quantity' already exists. Skipping.")
                else:
                    alter_sql = text("ALTER TABLE transaction ADD COLUMN extra_loose_quantity FLOAT DEFAULT 0.0;")
                    conn.execute(alter_sql)
                    print("Added column: extra_loose_quantity")

                # 2. Add standard_bharti to Grain
                # Check if column exists
                check_sql = text("SELECT column_name FROM information_schema.columns WHERE table_name='grain' AND column_name='standard_bharti';")
                result = conn.execute(check_sql).fetchone()
                
                if result:
                    print("Column 'standard_bharti' already exists. Skipping.")
                else:
                    alter_sql = text("ALTER TABLE grain ADD COLUMN standard_bharti FLOAT DEFAULT 60.0;")
                    conn.execute(alter_sql)
                    print("Added column: standard_bharti")

        print("Migration to Supabase Successful!")

    except Exception as e:
        print(f"Migration Failed: {e}")

if __name__ == "__main__":
    migrate()
