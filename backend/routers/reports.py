from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select
from typing import List, Optional
from database import get_session
from models import Transaction, DispatchInfo
from pydantic import BaseModel
from datetime import datetime

router = APIRouter(prefix="/reports", tags=["Reports"])

class TransportReportItem(BaseModel):
    dispatch_id: int
    date: datetime
    invoice_number: Optional[int]
    transporter_name: str
    vehicle_number: Optional[str]
    total_weight: float
    rate: float
    gross_freight: float
    advance_paid: float
    delivery_paid: float
    shortage_deduction: float
    other_deduction: float
    total_deduction: float
    balance_pending: float
    status: str

@router.get("/transport", response_model=List[TransportReportItem])
def get_transport_report(session: Session = Depends(get_session)):
    """
    Fetch transport report data by joining DispatchInfo with Transactions.
    """
    # Select all dispatch info
    dispatches = session.exec(select(DispatchInfo)).all()
    
    report_data = []
    
    for d in dispatches:
        # Find associated transaction (first one in group to get date/invoice)
        trx = session.exec(select(Transaction).where(Transaction.sale_group_id == d.sale_group_id)).first()
        
        if not trx:
            continue # Skip orphan dispatch records? Or show with null date? Skip for now.
            
        deductions = d.shortage_deduction + d.other_deduction
        pending = d.gross_freight - d.advance_paid - d.delivery_paid - deductions
        
        status = "Pending"
        if pending < 1:
            status = "Paid"
        elif d.advance_paid + d.delivery_paid > 0:
            status = "Partial"
            
        item = TransportReportItem(
            dispatch_id=d.id,
            date=trx.date,
            invoice_number=trx.invoice_number,
            transporter_name=d.transporter_name or "Unknown",
            vehicle_number=d.vehicle_number,
            total_weight=d.total_weight,
            rate=d.rate,
            gross_freight=d.gross_freight,
            advance_paid=d.advance_paid,
            delivery_paid=d.delivery_paid,
            shortage_deduction=d.shortage_deduction,
            other_deduction=d.other_deduction,
            total_deduction=deductions,
            balance_pending=pending,
            status=status
        )
        report_data.append(item)
        
    # Sort by date desc
    report_data.sort(key=lambda x: x.date, reverse=True)
    
    return report_data
