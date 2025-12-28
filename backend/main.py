from fastapi import FastAPI
from database import create_db_and_tables, engine
from contextlib import asynccontextmanager
from sqlmodel import Session, select
from models import User
from routers.auth import get_password_hash

@asynccontextmanager
async def lifespan(app: FastAPI):
    create_db_and_tables()
    
    # Seed Admin
    with Session(engine) as session:
        user = session.exec(select(User)).first()
        if not user:
            print("Creating default admin...")
            admin = User(
                username="admin", 
                password_hash=get_password_hash("admin123"), 
                role="admin", 
                permissions='["all"]', 
                token_version=1
            )
            session.add(admin)
            session.commit()
            print("Default admin created: admin / admin123")
    
    yield

app = FastAPI(lifespan=lifespan, title="Grain Manager API")

from fastapi.middleware.cors import CORSMiddleware

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

from routers import auth, master_data, transactions, inventory, stats
app.include_router(auth.router)
app.include_router(master_data.router)
app.include_router(transactions.router)
app.include_router(inventory.router)
app.include_router(stats.router)

@app.get("/")
def read_root():
    return {"message": "Welcome to Grain Manager API"}

# Force reload for DB regeneration
