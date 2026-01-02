from database import engine
from sqlalchemy import text
from sqlmodel import Session

def upgrade():
    with Session(engine) as session:
        try:
            print("Attempting to add mandi_cost column...")
            session.exec(text("ALTER TABLE transaction ADD COLUMN mandi_cost FLOAT DEFAULT 0.0"))
            session.commit()
            print("Successfully added mandi_cost column.")
        except Exception as e:
            print(f"Error (column might already exist): {e}")

if __name__ == "__main__":
    upgrade()
