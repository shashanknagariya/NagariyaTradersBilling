from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from sqlmodel import Session, select
from typing import List, Optional
from datetime import datetime, timedelta
from jose import JWTError, jwt
from passlib.context import CryptContext
from pydantic import BaseModel
import json

from database import get_session
from models import User

router = APIRouter()

import os
from dotenv import load_dotenv

load_dotenv()

# Configuration
SECRET_KEY = os.getenv("SECRET_KEY", "")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 # 1 day

pwd_context = CryptContext(schemes=["pbkdf2_sha256"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="auth/login")

# Schemas
class Token(BaseModel):
    access_token: str
    token_type: str
    user: dict

class UserCreate(BaseModel):
    username: str
    password: str
    role: str = "worker"
    permissions: List[str] = []

class UserUpdate(BaseModel):
    password: Optional[str] = None
    permissions: Optional[List[str]] = None
    role: Optional[str] = None

class UserRead(BaseModel):
    id: int
    username: str
    role: str
    permissions: List[str]
    token_version: int

# Utils
def verify_password(plain_password, hashed_password):
    return pwd_context.verify(plain_password, hashed_password)

def get_password_hash(password):
    return pwd_context.hash(password)

def create_access_token(data: dict):
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

# Dependency
async def get_current_user(token: str = Depends(oauth2_scheme), session: Session = Depends(get_session)):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        token_version: int = payload.get("v")
        if username is None or token_version is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception
        
    user = session.exec(select(User).where(User.username == username)).first()
    if user is None:
        raise credentials_exception
        
    # IMMEDIATE LOGOUT CHECK
    if user.token_version != token_version:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, 
            detail="Session expired/password changed",
            headers={"WWW-Authenticate": "Bearer"}
        )
        
    return user

async def get_current_admin(current_user: User = Depends(get_current_user)):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Not authorized")
    return current_user

# Routes

from logger import get_logger
logger = get_logger("auth")

# ... (imports)

@router.post("/auth/login", response_model=Token)
async def login_for_access_token(form_data: OAuth2PasswordRequestForm = Depends(), session: Session = Depends(get_session)):
    logger.info(f"Login attempt for user: {form_data.username}")
    user = session.exec(select(User).where(User.username == form_data.username)).first()
    if not user or not verify_password(form_data.password, user.password_hash):
        logger.warning(f"Login failed for user: {form_data.username}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    logger.info(f"Login successful for user: {form_data.username}")
    # Generate Token with Version
    access_token = create_access_token(data={"sub": user.username, "v": user.token_version})
    
    # Parse permissions
    perms = []
    try:
        perms = json.loads(user.permissions)
    except:
        pass

    return {
        "access_token": access_token, 
        "token_type": "bearer",
        "user": {
            "id": user.id,
            "username": user.username,
            "role": user.role,
            "permissions": perms
        }
    }

# ... (me endpoint)

@router.post("/auth/setup")
async def setup_initial_admin(user_data: UserCreate, session: Session = Depends(get_session)):
    logger.info("Setup initial admin requested")
    # Only allow if no users exist
    users = session.exec(select(User)).all()
    if len(users) > 0:
        logger.warning("Setup attempted but users already exist")
        raise HTTPException(status_code=400, detail="Setup already complete")
        
    user = User(
        username=user_data.username,
        password_hash=get_password_hash(user_data.password),
        role="admin",
        permissions='["all"]',
        token_version=1
    )
    session.add(user)
    session.commit()
    session.refresh(user)
    logger.info(f"Admin created via setup: {user.username}")
    return {"message": "Admin created"}

# Admin User Management

@router.get("/users/", response_model=List[UserRead], dependencies=[Depends(get_current_admin)])
async def list_users(session: Session = Depends(get_session)):
    users = session.exec(select(User)).all()
    res = []
    for u in users:
        perms = []
        try:
             perms = json.loads(u.permissions)
        except: pass
        res.append(UserRead(
             id=u.id, 
             username=u.username, 
             role=u.role, 
             permissions=perms,
             token_version=u.token_version
        ))
    return res

@router.post("/users/", response_model=UserRead, dependencies=[Depends(get_current_admin)])
async def create_user(user_in: UserCreate, session: Session = Depends(get_session)):
    # Check exists
    existing = session.exec(select(User).where(User.username == user_in.username)).first()
    if existing:
        raise HTTPException(status_code=400, detail="Username already exists")
        
    user = User(
        username=user_in.username,
        password_hash=get_password_hash(user_in.password),
        role=user_in.role,
        permissions=json.dumps(user_in.permissions),
        token_version=1
    )
    session.add(user)
    session.commit()
    session.refresh(user)
    
    return UserRead(
         id=user.id, username=user.username, role=user.role, permissions=user_in.permissions, token_version=1
    )

@router.put("/users/{user_id}", dependencies=[Depends(get_current_admin)])
async def update_user(user_id: int, user_in: UserUpdate, session: Session = Depends(get_session)):
    user = session.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
        
    if user_in.password:
        user.password_hash = get_password_hash(user_in.password)
        user.token_version += 1 # REVOKE TOKENS
        
    if user_in.role:
        user.role = user_in.role
        
    if user_in.permissions is not None:
        user.permissions = json.dumps(user_in.permissions)
        
    session.add(user)
    session.commit()
    return {"message": "User updated", "new_version": user.token_version}
