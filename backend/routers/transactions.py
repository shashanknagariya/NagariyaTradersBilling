from fastapi import APIRouter, Depends
from sqlmodel import Session, select
from database import get_session
from models import Transaction, PaymentHistory
from typing import List
from sqlalchemy import func

router = APIRouter(prefix="/transactions", tags=["transactions"])

@router.post("/", response_model=Transaction)
def create_transaction(transaction: Transaction, session: Session = Depends(get_session)):
    # Calculate total if not provided
    if transaction.total_amount == 0 and transaction.quantity_quintal > 0 and transaction.rate_per_quintal > 0:
        transaction.total_amount = transaction.quantity_quintal * transaction.rate_per_quintal

    # Auto Increment Invoice Number
    max_inv = session.exec(select(func.max(Transaction.invoice_number)).where(Transaction.type == transaction.type)).first()
    transaction.invoice_number = (max_inv or 0) + 1
        
    session.add(transaction)
    session.commit()
    session.refresh(transaction)
    return transaction

from pydantic import BaseModel
import uuid

class WarehouseAllocation(BaseModel):
    warehouse_id: int
    bags: int

class BulkSaleCreate(BaseModel):
    contact_id: int
    grain_id: int
    rate_per_quintal: float
    bharti: float # kg per bag
    transporter_name: str | None = None
    destination: str | None = None
    driver_name: str | None = None
    vehicle_number: str | None = None
    warehouses: List[WarehouseAllocation]
    tax_percentage: float = 0.0

@router.post("/bulk_sale", response_model=List[Transaction])
def create_bulk_sale(sale_data: BulkSaleCreate, session: Session = Depends(get_session)):
    sale_group_id = str(uuid.uuid4())
    transactions = []
    
    # 1. Calculate Average Purchase Cost (for Profit visibility)
    # Fetch all purchases for this grain
    purchases = session.exec(select(Transaction).where(Transaction.type == "purchase", Transaction.grain_id == sale_data.grain_id)).all()
    total_p_val = sum(p.total_amount for p in purchases)
    total_p_qty = sum(p.quantity_quintal for p in purchases)
    avg_cost = total_p_val / total_p_qty if total_p_qty > 0 else 0.0
    
    # 2. Auto Increment Invoice Number (One per Group)
    max_inv = session.exec(select(func.max(Transaction.invoice_number)).where(Transaction.type == "sale")).first()
    next_inv = (max_inv or 0) + 1

    for alloc in sale_data.warehouses:
        qty_quintal = (alloc.bags * sale_data.bharti) / 100.0
        subtotal = qty_quintal * sale_data.rate_per_quintal
        tax_amt = subtotal * (sale_data.tax_percentage / 100.0)
        total_amt = subtotal + tax_amt
        
        transaction = Transaction(
            date=None, # defaults to now
            type="sale",
            grain_id=sale_data.grain_id,
            contact_id=sale_data.contact_id,
            warehouse_id=alloc.warehouse_id,
            quantity_quintal=qty_quintal,
            number_of_bags=alloc.bags,
            rate_per_quintal=sale_data.rate_per_quintal,
            total_amount=total_amt,
            tax_percentage=sale_data.tax_percentage,
            cost_price_per_quintal=avg_cost,
            payment_status="pending",
            invoice_number=next_inv, # Assign same invoice number
            notes=f"Bulk Sale: {alloc.bags} bags",
            transporter_name=sale_data.transporter_name,
            destination=sale_data.destination,
            driver_name=sale_data.driver_name,
            vehicle_number=sale_data.vehicle_number,
            sale_group_id=sale_group_id
        )
        session.add(transaction)
        transactions.append(transaction)
        
    session.commit()
    for t in transactions:
        session.refresh(t)
        
    return transactions

@router.get("/bill/{transaction_id}", response_model=List[Transaction])
def get_transaction_bill(transaction_id: int, session: Session = Depends(get_session)):
    # 1. Get the specific transaction
    main_trx = session.get(Transaction, transaction_id)
    if not main_trx:
        return []
    
    # 2. If it's part of a group, fetch all in group
    if main_trx.sale_group_id:
        statement = select(Transaction).where(Transaction.sale_group_id == main_trx.sale_group_id)
        return session.exec(statement).all()
    
    # 3. Otherwise return just this one
    return [main_trx]

@router.get("/", response_model=List[Transaction])
def read_transactions(skip: int = 0, limit: int = 100, session: Session = Depends(get_session)):
    transactions = session.exec(select(Transaction).offset(skip).limit(limit)).all()
    return transactions

@router.delete("/{transaction_id}")
def delete_transaction(transaction_id: int, session: Session = Depends(get_session)):
    transaction = session.get(Transaction, transaction_id)
    if not transaction:
        return {"error": "Transaction not found"}
    session.delete(transaction)
    session.commit()
    return {"ok": True}

class PaymentUpdate(BaseModel):
    amount: float

@router.post("/{transaction_id}/payment")
def update_payment(transaction_id: int, payment: PaymentUpdate, session: Session = Depends(get_session)):
    transaction = session.get(Transaction, transaction_id)
    if not transaction:
        return {"error": "Transaction not found"}
    
    # Create History Record
    history = PaymentHistory(
        transaction_id=transaction.id,
        amount=payment.amount
    )
    session.add(history)

    # Update Transaction Total
    transaction.amount_paid += payment.amount
    
    # Update Status
    if transaction.amount_paid >= transaction.total_amount:
        transaction.payment_status = "paid"
    elif transaction.amount_paid > 0:
        transaction.payment_status = "partial"
    else:
        transaction.payment_status = "pending"
        
    session.add(transaction)
    session.commit()
    session.refresh(transaction)
    return transaction

@router.get("/{transaction_id}/payments", response_model=List[PaymentHistory])
def get_transaction_payments(transaction_id: int, session: Session = Depends(get_session)):
    statement = select(PaymentHistory).where(PaymentHistory.transaction_id == transaction_id).order_by(PaymentHistory.date.desc())
    return session.exec(statement).all()

from typing import Optional
from datetime import datetime

class TransactionUpdate(BaseModel):
    date: Optional[datetime] = None
    grain_id: Optional[int] = None
    contact_id: Optional[int] = None
    warehouse_id: Optional[int] = None
    quantity_quintal: Optional[float] = None
    number_of_bags: Optional[float] = None
    rate_per_quintal: Optional[float] = None
    total_amount: Optional[float] = None
    amount_paid: Optional[float] = None
    vehicle_number: Optional[str] = None
    driver_name: Optional[str] = None
    destination: Optional[str] = None
    transporter_name: Optional[str] = None
    notes: Optional[str] = None

@router.put("/{transaction_id}", response_model=Transaction)
def update_transaction(transaction_id: int, updates: TransactionUpdate, session: Session = Depends(get_session)):
    transaction = session.get(Transaction, transaction_id)
    if not transaction:
        return {"error": "Transaction not found"}
    
    update_data = updates.dict(exclude_unset=True)
    for key, value in update_data.items():
        setattr(transaction, key, value)
        
    session.add(transaction)
    session.commit()
    session.refresh(transaction)
    return transaction
