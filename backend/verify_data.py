from sqlmodel import Session, select, func
from database import engine
from models import Transaction

def verify():
    results = []
    with Session(engine) as session:
        items = session.exec(select(Transaction)).all()
        if not items:
            results.append("FAIL: No transactions found! Seeding failed?")
        else:
             results.append(f"INFO: Found {len(items)} transactions.")

        results.append("Verifying invoice numbers...")
        missing_inv = session.exec(select(Transaction).where(Transaction.invoice_number == None)).all()
        if missing_inv:
            results.append(f"FAIL: Found {len(missing_inv)} transactions without invoice number!")
        else:
            results.append("PASS: All transactions have invoice numbers.")

        # Calculate Global Totals for Debugging
        total_p = session.exec(select(func.sum(Transaction.quantity_quintal)).where(Transaction.type == "purchase")).one() or 0.0
        total_s = session.exec(select(func.sum(Transaction.quantity_quintal)).where(Transaction.type == "sale")).one() or 0.0
        results.append(f"\nGLOBAL STATS:\nTotal Purchased: {total_p:.2f} Qtl")
        results.append(f"Total Sold: {total_s:.2f} Qtl")
        results.append(f"Remaining Stock: {total_p - total_s:.2f} Qtl")

        results.append("\nVerifying Inventory...")
        # Calculate inventory manually: Sum(Purchase) - Sum(Sale) per grain+warehouse
        
        # 1. Get all combinations
        grains = session.exec(select(Transaction.grain_id).distinct()).all()
        warehouses = session.exec(select(Transaction.warehouse_id).distinct()).all()
        
        all_good = True
        for g_id in grains:
            for w_id in warehouses:
                p_qty = session.exec(select(func.sum(Transaction.quantity_quintal)).where(
                    Transaction.type == "purchase", 
                    Transaction.grain_id == g_id, 
                    Transaction.warehouse_id == w_id
                )).first() or 0.0
                
                s_qty = session.exec(select(func.sum(Transaction.quantity_quintal)).where(
                    Transaction.type == "sale", 
                    Transaction.grain_id == g_id, 
                    Transaction.warehouse_id == w_id
                )).first() or 0.0
                
                balance = p_qty - s_qty
                if balance < -0.01: # allow tiny float error
                    results.append(f"FAIL: Negative Inventory for Grain {g_id}, Warehouse {w_id}: {balance}")
                    all_good = False
        
        if all_good:
            results.append("PASS: No negative inventory found.")

    with open("verification_results.txt", "w") as f:
        f.write("\n".join(results))

if __name__ == "__main__":
    verify()
