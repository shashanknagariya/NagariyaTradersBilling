from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select
from database import get_session
from models import Transaction, PaymentHistory, DispatchInfo
from typing import List, Optional
from sqlalchemy import func
from logger import get_logger
logger = get_logger("transactions")

router = APIRouter(prefix="/transactions", tags=["transactions"])

@router.post("/", response_model=Transaction)
def create_transaction(transaction: Transaction, session: Session = Depends(get_session)):
    # Calculate total if not provided
    if transaction.total_amount == 0 and transaction.quantity_quintal > 0 and transaction.rate_per_quintal > 0:
        raw_total = transaction.quantity_quintal * transaction.rate_per_quintal
        
        if transaction.type == 'purchase':
             # Purchase: Deduct Labour Cost (Palledari)
             # Use provided labour cost or default 3.0
             l_rate = transaction.labour_cost_per_bag if transaction.labour_cost_per_bag > 0 else 3.0
             labour = (transaction.number_of_bags or 0) * l_rate
             transaction.labour_cost_total = labour
             transaction.total_amount = raw_total - labour
             transaction.labour_cost_per_bag = l_rate 
        else:
             # Regular Sale (Non-Bulk) - rarely used but good to have
             transaction.total_amount = raw_total
             # (Expenses logic omitted for single sale as UI primarily uses Bulk)

    # Auto Increment Invoice Number
    max_inv = session.exec(select(func.max(Transaction.invoice_number)).where(Transaction.type == transaction.type)).first()
    transaction.invoice_number = (max_inv or 0) + 1
        
    session.add(transaction)
    session.commit()
    session.refresh(transaction)
    logger.info(f"Transaction created: {transaction.type.upper()} {transaction.invoice_number} (Grain: {transaction.grain_id})")
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
    total_weight_kg: float # Total weight from weighbridge
    transporter_name: str | None = None
    destination: str | None = None
    driver_name: str | None = None
    vehicle_number: str | None = None
    warehouses: List[WarehouseAllocation]
    tax_percentage: float = 0.0
    labour_cost_per_bag: float = 3.0
    transport_cost_per_qtl: float = 0.0
    transport_advance: float = 0.0
    mandi_cost: float = 9000.0 # Default total mandi cost for the bill

class TransactionUpdate(BaseModel):
    quantity_quintal: Optional[float] = None
    rate_per_quintal: Optional[float] = None
    number_of_bags: Optional[float] = None
    amount_paid: Optional[float] = None
    labour_cost_per_bag: Optional[float] = None
    transport_cost_per_qtl: Optional[float] = None
    mandi_cost: Optional[float] = None
    expenses_total: Optional[float] = None
    tax_percentage: Optional[float] = None
    vehicle_number: Optional[str] = None
    driver_name: Optional[str] = None
    transporter_name: Optional[str] = None
    extra_loose_quantity: Optional[float] = None

@router.post("/bulk_sale", response_model=List[Transaction])
def create_bulk_sale(sale_data: BulkSaleCreate, session: Session = Depends(get_session)):
    sale_group_id = str(uuid.uuid4())
    transactions = []
    
    # 1. Calculate Average Purchase Cost (for Profit visibility)
    # Fetch all purchases for this grain
    purchases = session.exec(select(Transaction).where(Transaction.type == "purchase", Transaction.grain_id == sale_data.grain_id)).all()
    # Calculate using Cost to Company (Gross Rate)
    total_p_val = sum(p.quantity_quintal * p.rate_per_quintal for p in purchases)
    total_p_qty = sum(p.quantity_quintal for p in purchases)
    avg_cost = total_p_val / total_p_qty if total_p_qty > 0 else 0.0
    
    # 2. Auto Increment Invoice Number (One per Group)
    max_inv = session.exec(select(func.max(Transaction.invoice_number)).where(Transaction.type == "sale")).first()
    next_inv = (max_inv or 0) + 1

    # Calculate total quantity and bags
    total_bags = sum(alloc.bags for alloc in sale_data.warehouses)
    total_sale_qty = sale_data.total_weight_kg / 100.0 # Convert to Quintal

    transactions = []
    
    # 2. Iterate and Create Transactions (Proportional Distribution)
    for alloc in sale_data.warehouses:
        # Avoid division by zero
        if total_bags > 0:
            qty_quintal = (alloc.bags / total_bags) * total_sale_qty
        else:
            qty_quintal = 0.0
        
        # VALIDATION: Check Stock
        # Calculate available stock for this Grain + Warehouse
        p_qty = session.exec(select(func.sum(Transaction.quantity_quintal)).where(
            Transaction.type == "purchase", 
            Transaction.grain_id == sale_data.grain_id, 
            Transaction.warehouse_id == alloc.warehouse_id
        )).first() or 0.0
        
        s_qty = session.exec(select(func.sum(Transaction.quantity_quintal)).where(
            Transaction.type == "sale", 
            Transaction.grain_id == sale_data.grain_id, 
            Transaction.warehouse_id == alloc.warehouse_id
        )).first() or 0.0
        
        available_stock = p_qty - s_qty
        
        if qty_quintal > available_stock:
             # Fetch warehouse name for better error
             from models import Warehouse
             wh_name = session.get(Warehouse, alloc.warehouse_id).name
             raise HTTPException(
                 status_code=400, 
                 detail=f"Insufficient stock in {wh_name}. Available: {available_stock:.2f} Qtl, Requested: {qty_quintal:.2f} Qtl"
             )

        # Cost Calculations
        labour_total = alloc.bags * sale_data.labour_cost_per_bag
        transport_total = qty_quintal * sale_data.transport_cost_per_qtl
        
        # Mandi Cost Distribution
        # Proportion = (this_qty / total_qty) * total_mandi_cost
        mandi_share = 0.0
        if total_sale_qty > 0:
            mandi_share = (qty_quintal / total_sale_qty) * sale_data.mandi_cost
        
        # NOTE: For SALE, we DO NOT deduct from Total Amount (Buyer pays full grain price).
        # These are internal expenses reflected in profit.
        expenses = labour_total + transport_total
        # Mandi cost is also an expense but we store it separately or in expenses?
        # Storing in separate field for now, but expenses_total usually tracked "other expenses".
        # Let's keep expenses_total as is (labour+transport?) or include mandi?
        # User asked for "Mandi Cost" field. We added it.
        # Let's NOT add to expenses_total automatically to avoid confusion if expenses_total is used for "labour+transport" display.
        # But for profit calc, we need to sum all.
        
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
            
            # Record Costs
            labour_cost_per_bag=sale_data.labour_cost_per_bag,
            transport_cost_per_qtl=sale_data.transport_cost_per_qtl,
            mandi_cost=mandi_share,
            expenses_total=expenses,
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
        
    
    # 3. Create Dispatch Record (Auto-calculated)
    # Total Freight = Sum of (Qty * TransportRate)
    total_qty_qtl = sum(t.quantity_quintal for t in transactions)
    # Use the transport rate from the first item (assuming uniform rate for the trip) or from input
    t_rate = sale_data.transport_cost_per_qtl
    gross_freight = total_qty_qtl * t_rate
    
    dispatch_info = DispatchInfo(
        sale_group_id=sale_group_id,
        transporter_name=sale_data.transporter_name,
        vehicle_number=sale_data.vehicle_number,
        driver_name=sale_data.driver_name,
        rate=t_rate,
        total_weight=total_qty_qtl,
        gross_freight=gross_freight,
        advance_paid=sale_data.transport_advance, # Use input advance
        status="pending"
    )
    session.add(dispatch_info)
    
    session.commit()
    # Refresh all to get IDs
    for t in transactions:
        session.refresh(t)
    
    logger.info(f"Bulk Sale Created: {len(transactions)} transactions. Group ID: {sale_group_id}")
    return transactions

@router.get("/dispatch/{sale_group_id}", response_model=DispatchInfo)
def get_dispatch_info(sale_group_id: str, session: Session = Depends(get_session)):
    dispatch = session.exec(select(DispatchInfo).where(DispatchInfo.sale_group_id == sale_group_id)).first()
    if not dispatch:
        # Instead of 404, we can create one on the fly if missing (for legacy data), 
        # BUT for now let's return 404 and handle in frontend or return empty
        # Better: Return 404, frontend can show "Create" button or just empty fields
        raise HTTPException(status_code=404, detail="Dispatch info not found")
    return dispatch

@router.put("/dispatch/{dispatch_id}", response_model=DispatchInfo)
def update_dispatch_info(dispatch_id: int, updates: DispatchInfo, session: Session = Depends(get_session)):
    dispatch = session.get(DispatchInfo, dispatch_id)
    if not dispatch:
        raise HTTPException(status_code=404, detail="Dispatch info not found")
    
    dispatch_data = updates.model_dump(exclude_unset=True)
    
    # Calculate potential new values
    new_advance = dispatch_data.get('advance_paid', dispatch.advance_paid)
    new_delivery = dispatch_data.get('delivery_paid', dispatch.delivery_paid)
    new_shortage = dispatch_data.get('shortage_deduction', dispatch.shortage_deduction)
    new_other = dispatch_data.get('other_deduction', dispatch.other_deduction)
    
    total_paid_deducted = new_advance + new_delivery + new_shortage + new_other
    # Allow 1.0 buffer for float precision
    if total_paid_deducted > dispatch.gross_freight + 1.0:
        raise HTTPException(
            status_code=400, 
            detail=f"Total payments/deductions ({total_paid_deducted:.2f}) cannot exceed Gross Freight ({dispatch.gross_freight:.2f})"
        )

    for key, value in dispatch_data.items():
        # Avoid overwriting ID or Group ID if passed
        if key not in ['id', 'sale_group_id']:
            setattr(dispatch, key, value)
        
    session.add(dispatch)
    session.commit()
    session.refresh(dispatch)
    return dispatch

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
def read_transactions(skip: int = 0, limit: int = 2000, session: Session = Depends(get_session)):
    transactions = session.exec(select(Transaction).offset(skip).limit(limit)).all()
    return transactions

@router.delete("/{transaction_id}")
def delete_transaction(transaction_id: int, session: Session = Depends(get_session)):
    transaction = session.get(Transaction, transaction_id)
    if not transaction:
        return {"error": "Transaction not found"}
    
    # Cascade Delete: Remove associated payment history first
    payments = session.exec(select(PaymentHistory).where(PaymentHistory.transaction_id == transaction_id)).all()
    for p in payments:
        session.delete(p)

    session.delete(transaction)
    
    # Check if this was the last transaction in a group, if so, delete the Dispatch Info
    if transaction.sale_group_id:
        # Check if any other transaction exists with this group ID
        others = session.exec(select(Transaction).where(
            Transaction.sale_group_id == transaction.sale_group_id, 
            Transaction.id != transaction_id
        )).first()
        
        if not others:
            # Delete Dispatch Info
            dispatch = session.exec(select(DispatchInfo).where(DispatchInfo.sale_group_id == transaction.sale_group_id)).first()
            if dispatch:
                session.delete(dispatch)
                logger.info(f"Dispatch Info deleted for group {transaction.sale_group_id}")

    session.commit()
    logger.info(f"Transaction deleted: {transaction_id}")
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

    # Calculate Net Total (Post Deductions)
    shortage_val = (transaction.shortage_quantity or 0) * transaction.rate_per_quintal
    deduction = transaction.deduction_amount or 0
    net_total = transaction.total_amount - shortage_val - deduction
    
    current_pending = net_total - transaction.amount_paid
    
    # Validation: Prevent Overpayment
    # Allow small float buffer (1.0)
    if payment.amount > current_pending + 1.0:
        raise HTTPException(status_code=400, detail=f"Cannot accept ₹{payment.amount}. Max receivable is ₹{current_pending:.2f}")

    session.add(history)

    # Update Transaction Total
    transaction.amount_paid += payment.amount
    
    # Update Status
    # Calculate Net Amount (Post Deductions)
    shortage_val = (transaction.shortage_quantity or 0) * transaction.rate_per_quintal
    deduction = transaction.deduction_amount or 0
    net_total = transaction.total_amount - shortage_val - deduction
    
    # Use a small epsilon for float comparison
    if transaction.amount_paid >= net_total - 1.0:
        transaction.payment_status = "paid"
    elif transaction.amount_paid > 0:
        transaction.payment_status = "partial"
    else:
        transaction.payment_status = "pending"
        
    session.add(transaction)
    session.commit()
    session.refresh(transaction)
    logger.info(f"Payment recorded: {payment.amount} for Trx {transaction_id}")
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
    shortage_quantity: Optional[float] = None
    deduction_amount: Optional[float] = None
    deduction_note: Optional[str] = None
    labour_cost_per_bag: Optional[float] = None
    transport_cost_per_qtl: Optional[float] = None

@router.put("/{transaction_id}", response_model=Transaction)
def update_transaction(transaction_id: int, updates: TransactionUpdate, session: Session = Depends(get_session)):
    transaction = session.get(Transaction, transaction_id)
    if not transaction:
        return {"error": "Transaction not found"}
    
    update_data = updates.dict(exclude_unset=True)
    for key, value in update_data.items():
        setattr(transaction, key, value)
    
    # Re-calculate Payment Status if amounts changed
    shortage_val = (transaction.shortage_quantity or 0) * transaction.rate_per_quintal
    deduction = transaction.deduction_amount or 0
    net_total = transaction.total_amount - shortage_val - deduction
    
    if transaction.amount_paid >= net_total - 1.0:
        transaction.payment_status = "paid"
    elif transaction.amount_paid > 0:
        transaction.payment_status = "partial"
    else:
        transaction.payment_status = "pending"
        
    session.add(transaction)
    session.commit()
    session.refresh(transaction)
    
    # NEW: Sync Dispatch Info if Quantity or Transport Cost changed
    if transaction.sale_group_id and (updates.quantity_quintal is not None or updates.transport_cost_per_qtl is not None):
        dispatch = session.exec(select(DispatchInfo).where(DispatchInfo.sale_group_id == transaction.sale_group_id)).first()
        if dispatch:
            # Re-fetch all transactions in group to recalculate totals
            group_trxs = session.exec(select(Transaction).where(Transaction.sale_group_id == transaction.sale_group_id)).all()
            
            new_total_qty = sum(t.quantity_quintal for t in group_trxs)
            # We assume rate might differ or just take average? 
            # Safest is to calculate Total Freight based on individual rows
            new_gross_freight = sum(t.quantity_quintal * t.transport_cost_per_qtl for t in group_trxs)
            
            dispatch.total_weight = new_total_qty
            dispatch.gross_freight = new_gross_freight
            # Update rate to match the updated transaction if changed, or keep average
            if updates.transport_cost_per_qtl:
                 dispatch.rate = updates.transport_cost_per_qtl
            
            session.add(dispatch)
            session.commit()
            logger.info(f"Dispatch Info updated for group {transaction.sale_group_id}")

    logger.info(f"Transaction updated: {transaction_id}")
    return transaction
