from sqlmodel import SQLModel, create_engine, Session
import os
from dotenv import load_dotenv

# Load env vars from .env for local dev
load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")

if DATABASE_URL and "postgres" in DATABASE_URL:
    # Fix Render/Heroku postgres:// -> postgresql://
    if DATABASE_URL.startswith("postgres://"):
        DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)
    
    engine = create_engine(DATABASE_URL, echo=True)
    print("Using PostgreSQL Database (Supabase)")
else:
    # Fallback to Local SQLite
    sqlite_file_name = "grain_trading_v11.db"
    sqlite_url = f"sqlite:///{sqlite_file_name}"
    connect_args = {"check_same_thread": False}
    engine = create_engine(sqlite_url, echo=True, connect_args=connect_args)
    print("Using Local SQLite Database")

def create_db_and_tables():
    SQLModel.metadata.create_all(engine)

def get_session():
    with Session(engine) as session:
        yield session
