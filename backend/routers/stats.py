from fastapi import APIRouter, Depends
from sqlmodel import Session, select
from database import get_session
from models import Transaction, Grain
from typing import Dict, Any

router = APIRouter(prefix="/stats", tags=["stats"])

@router.get("/dashboard", response_model=Dict[str, Any])
def get_dashboard_stats(session: Session = Depends(get_session)):
    transactions = session.exec(select(Transaction)).all()
    inventory_data = {} # grain_id -> {qty, avg_price}

    total_receivable = 0.0
    total_payable = 0.0
    
    # Calculate Receivable/Payable & Inventory Avg Price Data
    for trx in transactions:
        pending = trx.total_amount - trx.amount_paid
        
        if trx.type == 'sale':
            # Deduct shortage and other deductions from pending amount logic
            # Adjusted Expected Amount = (Qty - Shortage) * Rate - Deduction
            # Note: total_amount stored is Qty * Rate.
            # So Adjusted = Total - (Shortage * Rate) - Deduction
            
            loss_amt = (trx.shortage_quantity * trx.rate_per_quintal) + trx.deduction_amount
            real_pending = (trx.total_amount - loss_amt) - trx.amount_paid
            
            if real_pending > 0: total_receivable += real_pending
            
            # Inventory Subtraction
            gid = trx.grain_id
            if gid not in inventory_data: inventory_data[gid] = {"qty": 0, "val": 0, "purchased_qty": 0}
            inventory_data[gid]["qty"] -= trx.quantity_quintal
            
        elif trx.type == 'purchase':
            if pending > 0: total_payable += pending
            
            # Inventory Addition + Avg Price Calculation
            gid = trx.grain_id
            if gid not in inventory_data: inventory_data[gid] = {"qty": 0, "val": 0, "purchased_qty": 0}
            
            inventory_data[gid]["qty"] += trx.quantity_quintal
            inventory_data[gid]["val"] += trx.total_amount
            inventory_data[gid]["purchased_qty"] += trx.quantity_quintal

    # Calculate Total Inventory Value
    total_inventory_value = 0.0
    for gid, data in inventory_data.items():
        if data["qty"] > 0 and data["purchased_qty"] > 0:
            avg_price = data["val"] / data["purchased_qty"]
            total_inventory_value += (data["qty"] * avg_price)

    return {
        "total_receivable": total_receivable,
        "total_payable": total_payable,
        "total_inventory_value": total_inventory_value
    }
