from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from sqlmodel import Session, select
from database import get_session
from models import Transaction, Grain, Contact, Warehouse, DispatchInfo
from typing import List, Optional, Dict, Any, Union
from pydantic import BaseModel
from datetime import datetime
import io
import csv

router = APIRouter(prefix="/analytics", tags=["analytics"])

class AnalyticsQuery(BaseModel):
    report_type: str = "profit" # profit, purchase, sale, transport
    group_by: str = "none" # none, grain, party, warehouse
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None
    status: str = "all" # all, paid, pending, partial
    search_query: Optional[str] = None

def _get_analytics_data(session: Session, query: AnalyticsQuery, limit: Optional[int] = None):
    # 1. Fetch Masters for Mapping
    grains = {g.id: g.name for g in session.exec(select(Grain)).all()}
    contacts = {c.id: c.name for c in session.exec(select(Contact)).all()}
    warehouses = {w.id: w.name for w in session.exec(select(Warehouse)).all()}

    # 2. Build Query
    stmt = select(Transaction)
    
    # Filter by Report Type
    if query.report_type == 'purchase':
        stmt = stmt.where(Transaction.type == 'purchase')
    elif query.report_type == 'sale':
        stmt = stmt.where(Transaction.type == 'sale')
    elif query.report_type == 'profit':
        # Profit commonly implies sales analysis, but frontend logic usually filters Type=Sale for Profit view
        # However, to calculate profit, we might need cost info.
        # Generally "Profit Report" shows Sales.
        stmt = stmt.where(Transaction.type == 'sale')
    
    # Date Filter
    if query.start_date:
        stmt = stmt.where(Transaction.date >= query.start_date)
    if query.end_date:
        stmt = stmt.where(Transaction.date <= query.end_date)
        
    transactions = session.exec(stmt).all()
    
    # 3. Process Data (Memory - still faster than JS)
    # Ideally use SQL GROUP BY, but for complex logic (Net Realized), Python loop is robust enough for 2000-5000 records
    
    # Filter in Python for Search/Status (easier for calculated fields)
    filtered_data = []
    
    for t in transactions:
        # Search Filter
        if query.search_query:
            q = query.search_query.lower()
            c_name = contacts.get(t.contact_id, "").lower()
            inv = str(t.invoice_number or "")
            if q not in c_name and q not in inv:
                continue
        
        # Calculate Computed Fields
        qty = t.quantity_quintal
        rate = t.rate_per_quintal
        total = t.total_amount
        
        shortage_val = (t.shortage_quantity or 0) * rate
        deduction = t.deduction_amount or 0
        
        # Net Realized
        net_realized = total
        if t.type == 'sale':
            net_realized = total - shortage_val - deduction
            
        # Payment Status Logic
        effective_total = net_realized if t.type == 'sale' else total
        row_status = "pending"
        if t.amount_paid >= effective_total - 1.0:
            row_status = "paid"
        elif t.amount_paid > 0:
            row_status = "partial"
            
        if query.status != 'all' and query.status != row_status:
            continue
            
        # Profit Logic
        profit = 0
        if t.type == 'sale':
            cost_total = (t.cost_price_per_quintal or 0) * qty
            profit = net_realized - cost_total
            
        # Prepare Item
        item = {
            "trx": t,
            "net_realized": net_realized,
            "profit": profit,
            "status": row_status,
            "grain_name": grains.get(t.grain_id, "Unknown"),
            "contact_name": contacts.get(t.contact_id, "Unknown"),
            "warehouse_name": warehouses.get(t.warehouse_id, "Unknown")
        }
        filtered_data.append(item)

    # 4. Grouping
    groups = {}
    
    # Summary Totals
    global_total = {
        "count": 0, "qty": 0.0, "amount": 0.0, "paid": 0.0, "pending": 0.0, "profit": 0.0
    }
    
    rows = []
    # If Group By is None, usually we want a detailed list.
    # We populate 'rows' for detailed export/view.
    if query.group_by == 'none':
        data_to_process = filtered_data
        if limit is not None: # Check for None explicitly, as 0 is a valid limit
            data_to_process = filtered_data[:limit]
            
        for d in data_to_process:
            t = d["trx"]
            rows.append({
                "date": t.date,
                "invoice_number": t.invoice_number,
                "contactName": d["contact_name"],
                "grainName": d["grain_name"],
                "warehouseName": d["warehouse_name"],
                "quantity_quintal": t.quantity_quintal,
                "rate_per_quintal": t.rate_per_quintal,
                "baseAmount": t.total_amount, # Approx logic, accurate baseAmount logic in JS was qty*rate
                "shortageCost": (t.shortage_quantity or 0) * t.rate_per_quintal,
                "deductionCost": t.deduction_amount or 0,
                "labourCostTotal": (t.number_of_bags or 0) * (t.labour_cost_per_bag or 0),
                "transportCostTotal": t.quantity_quintal * (t.transport_cost_per_qtl or 0),
                "mandi_cost": t.mandi_cost,
                "netRealized": d["net_realized"],
                "paidAmount": t.amount_paid,
                "pendingAmount": (d["net_realized"] - t.amount_paid),
                "status": d["status"].title(), # "Paid" vs "paid"
                "profit": d["profit"],
                "cost_price_per_quintal": t.cost_price_per_quintal,
                "bags": t.number_of_bags
            })

    # Always calculate Groups/Totals on FULL filtered_data (ignore limit for totals)
    for d in filtered_data:
        t = d["trx"]
        
        # Determine Group Key
        key = "All"
        if query.group_by == 'grain': key = d["grain_name"]
        elif query.group_by == 'party': key = d["contact_name"]
        elif query.group_by == 'warehouse': key = d["warehouse_name"]
        
        if key not in groups:
            groups[key] = {
                "name": key, 
                "count": 0, 
                "qty": 0.0, 
                "amount": 0.0, 
                "paid": 0.0, 
                "pending": 0.0, 
                "profit": 0.0
            }
            
        # Aggregation
        groups[key]["count"] += 1
        groups[key]["qty"] += t.quantity_quintal
        groups[key]["amount"] += d["net_realized"]
        groups[key]["paid"] += t.amount_paid
        groups[key]["pending"] += (d["net_realized"] - t.amount_paid)
        groups[key]["profit"] += d["profit"]
        
        # Global
        global_total["count"] += 1
        global_total["qty"] += t.quantity_quintal
        global_total["amount"] += d["net_realized"]
        global_total["paid"] += t.amount_paid
        global_total["pending"] += (d["net_realized"] - t.amount_paid)
        global_total["profit"] += d["profit"]

    return {
        "summary": global_total,
        "groups": list(groups.values()),
        "rows": rows
    }

@router.post("/query")
def query_analytics(query: AnalyticsQuery, session: Session = Depends(get_session)):
    # Limit to 500 for UI performance
    return _get_analytics_data(session, query, limit=500)

@router.post("/export")
def export_analytics(query: AnalyticsQuery, session: Session = Depends(get_session)):
    # Unlimited fetch
    data = _get_analytics_data(session, query, limit=None)
    
    # Generate CSV
    output = io.StringIO()
    writer = csv.writer(output)
    
    # Headers based on type
    if query.group_by != 'none':
        headers = ['Group Name', 'Count', 'Total Qty', 'Total Amount', 'Paid', 'Pending', 'Total Profit']
        writer.writerow(headers)
        for g in data['groups']:
            writer.writerow([
                g['name'], g['count'], f"{g['qty']:.2f}", f"{g['amount']:.2f}", 
                f"{g['paid']:.2f}", f"{g['pending']:.2f}", f"{g['profit']:.2f}"
            ])
    else:
        # Detailed Rows
        headers = ['Date', 'Invoice', 'Party', 'Grain', 'Bags', 'Qty', 'Rate', 'Gross', 'Short', 'Ded', 'Lab', 'Trans', 'Mandi', 'Net Realized', 'Paid', 'Pending', 'Status', 'Profit']
        writer.writerow(headers)
        for r in data['rows']:
            writer.writerow([
                r['date'].isoformat() if r['date'] else '',
                r['invoice_number'],
                r['contactName'],
                r['grainName'],
                r['bags'],
                f"{r['quantity_quintal']:.2f}",
                f"{r['rate_per_quintal']:.2f}",
                f"{r['baseAmount']:.2f}",
                f"{r['shortageCost']:.2f}",
                f"{r['deductionCost']:.2f}",
                f"{r['labourCostTotal']:.2f}",
                f"{r['transportCostTotal']:.2f}",
                f"{(r['mandi_cost'] or 0):.2f}",
                f"{r['netRealized']:.2f}",
                f"{r['paidAmount']:.2f}",
                f"{r['pendingAmount']:.2f}",
                r['status'],
                f"{r['profit']:.2f}"
            ])
            
    output.seek(0)
    
    filename = f"report_{query.report_type}_{datetime.now().strftime('%Y%m%d')}.csv"
    return StreamingResponse(
        io.BytesIO(output.getvalue().encode()),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )
