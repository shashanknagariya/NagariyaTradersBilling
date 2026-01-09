from fastapi import FastAPI
from database import create_db_and_tables, engine
from contextlib import asynccontextmanager
from sqlmodel import Session, select
from models import User
from routers.auth import get_password_hash

from logger import get_logger

logger = get_logger("main")

@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Server starting up...")
    create_db_and_tables()
    logger.info("Database initialized.")
    
    # Seed Admin
    with Session(engine) as session:
        user = session.exec(select(User)).first()
        if not user:
            logger.info("Creating default admin...")
            admin = User(
                username="admin", 
                password_hash=get_password_hash("admin123"), 
                role="admin", 
                permissions='["all"]', 
                token_version=1
            )
            session.add(admin)
            session.commit()
            logger.info("Default admin created: admin / admin123")
    
    yield
    logger.info("Server shutting down...")

app = FastAPI(lifespan=lifespan, title="Grain Manager API")

from fastapi.middleware.cors import CORSMiddleware

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

from routers import auth, master_data, transactions, inventory, stats, reports, analytics
app.include_router(auth.router)
app.include_router(master_data.router)
app.include_router(transactions.router)
app.include_router(inventory.router)
app.include_router(stats.router)
app.include_router(reports.router)
app.include_router(analytics.router)

@app.get("/")
def read_root():
    return {"message": "Welcome to Grain Manager API"}

@app.get("/health")
@app.head("/health")
def health_check():
    return {"status": "ok", "service": "grain-manager-api"}

# Force reload for DB regeneration
