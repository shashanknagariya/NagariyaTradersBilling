from sqlalchemy import create_engine, text
import os
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")

def migrate():
    if not DATABASE_URL:
        print("CRITICAL ERROR: DATABASE_URL not found in environment variables.")
        print("Please ensure .env file exists and contains DATABASE_URL for Supabase.")
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
                
                columns = [
                    ("labour_cost_per_bag", "FLOAT DEFAULT 3.0"),
                    ("transport_cost_per_qtl", "FLOAT DEFAULT 0.0"),
                    ("labour_cost_total", "FLOAT DEFAULT 0.0"),
                    ("expenses_total", "FLOAT DEFAULT 0.0")
                ]

                for col_name, col_def in columns:
                    # Check if column exists to avoid error (Postgres specific check)
                    check_sql = text(f"SELECT column_name FROM information_schema.columns WHERE table_name='transaction' AND column_name='{col_name}';")
                    result = conn.execute(check_sql).fetchone()
                    
                    if result:
                        print(f"Column '{col_name}' already exists. Skipping.")
                    else:
                        alter_sql = text(f"ALTER TABLE transaction ADD COLUMN {col_name} {col_def};")
                        conn.execute(alter_sql)
                        print(f"Added column: {col_name}")

        print("Migration to Supabase Successful!")

    except Exception as e:
        print(f"Migration Failed: {e}")

if __name__ == "__main__":
    migrate()
