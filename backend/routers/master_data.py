from fastapi import APIRouter, Depends
from sqlmodel import Session, select
from database import get_session
from models import Grain, Warehouse, Contact
from typing import List

router = APIRouter(prefix="/master", tags=["master"])

# GRAINS
@router.post("/grains", response_model=Grain)
def create_grain(grain: Grain, session: Session = Depends(get_session)):
    session.add(grain)
    session.commit()
    session.refresh(grain)
    return grain

@router.get("/grains", response_model=List[Grain])
def read_grains(session: Session = Depends(get_session)):
    grains = session.exec(select(Grain)).all()
    return grains

# WAREHOUSES
@router.post("/warehouses", response_model=Warehouse)
def create_warehouse(warehouse: Warehouse, session: Session = Depends(get_session)):
    session.add(warehouse)
    session.commit()
    session.refresh(warehouse)
    return warehouse

@router.get("/warehouses", response_model=List[Warehouse])
def read_warehouses(session: Session = Depends(get_session)):
    warehouses = session.exec(select(Warehouse)).all()
    return warehouses

# CONTACTS
@router.post("/contacts", response_model=Contact)
def create_contact(contact: Contact, session: Session = Depends(get_session)):
    session.add(contact)
    session.commit()
    session.refresh(contact)
    return contact

@router.get("/contacts", response_model=List[Contact])
def read_contacts(session: Session = Depends(get_session)):
    contacts = session.exec(select(Contact)).all()
    return contacts
