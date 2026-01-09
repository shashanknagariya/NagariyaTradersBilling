import random
from datetime import datetime, timedelta
from sqlmodel import Session, select, func, delete
from database import engine
from models import Grain, Contact, Warehouse, Transaction, PaymentHistory, DispatchInfo

def create_random_date():
    start_date = datetime.now() - timedelta(days=365)
    random_days = random.randrange(365)
    return start_date + timedelta(days=random_days)

def clear_existing_data(session: Session):
    print("Clearing existing transaction data...")
    session.exec(delete(PaymentHistory))
    session.exec(delete(DispatchInfo))
    session.exec(delete(Transaction))
    session.commit()
    print("Data cleared.")

def seed_data():
    with Session(engine) as session:
        # Clear old data first
        clear_existing_data(session)

        print("Fetching Master Data...")
        grains = session.exec(select(Grain)).all()
        contacts = session.exec(select(Contact)).all()
        warehouses = session.exec(select(Warehouse)).all()

        if not grains or not contacts or not warehouses:
            print("Error: Missing master data. Please add at least one Grain, Contact, and Warehouse via the app first.")
            return

        transactions = []
        
        # Track Inventory: {(grain_id, warehouse_id): quantity_quintal}
        inventory = {}

        # Track Invoice Numbers
        # Fetch max current (should be 0 after clear, but good practice)
        max_p_inv = session.exec(select(func.max(Transaction.invoice_number)).where(Transaction.type == "purchase")).first() or 0
        max_s_inv = session.exec(select(func.max(Transaction.invoice_number)).where(Transaction.type == "sale")).first() or 0
        
        current_p_inv = max_p_inv
        current_s_inv = max_s_inv

        # 1. Purchases
        print("Generating 500 Purchases...")
        for _ in range(500):
            grain = random.choice(grains)
            contact = random.choice(contacts)
            warehouse = random.choice(warehouses)
            
            qty = round(random.uniform(10, 200), 2)
            rate = round(random.uniform(2000, 5000), 2)
            bags = int(qty * 2) # Approx 50kg bags
            
            # Basic calculation
            total_amount = round(qty * rate, 2)
            
            # Costs
            labour_cost = round(bags * 10, 2) # 10 rs per bag
            
            # Payment
            status = random.choice(["paid", "pending", "partial"])
            paid = 0
            if status == "paid": paid = total_amount
            elif status == "partial": paid = round(total_amount / 2, 2)
            
            current_p_inv += 1

            t = Transaction(
                date=create_random_date(),
                type="purchase",
                invoice_number=current_p_inv,
                grain_id=grain.id,
                contact_id=contact.id,
                warehouse_id=warehouse.id,
                quantity_quintal=qty,
                number_of_bags=bags,
                rate_per_quintal=rate,
                total_amount=total_amount,
                labour_cost_total=labour_cost,
                amount_paid=paid,
                payment_status=status
            )
            transactions.append(t)
            
            # Update Inventory
            key = (grain.id, warehouse.id)
            inventory[key] = inventory.get(key, 0.0) + qty

        # 2. Sales
        print("Generating Sales based on available inventory...")
        sales_count = 0
        # Try to generate sales, but skip if no inventory
        for _ in range(800): # Attempt 800 times, but might produce fewer if stock runs out
            grain = random.choice(grains)
            warehouse = random.choice(warehouses)
            
            key = (grain.id, warehouse.id)
            available_stock = inventory.get(key, 0.0)
            
            # Skip if no stock or very low stock
            if available_stock < 1.0:
                continue

            contact = random.choice(contacts)
            
            # Determine Sale Quantity (max 80% of available stock to keep some balance positive)
            max_qty = min(available_stock, 200.0) # Cap at 200 like purchase
            qty = round(random.uniform(1.0, max_qty), 2)
            
            rate = round(random.uniform(2500, 6000), 2)
            bags = int(qty * 2)
            
            total_amount = round(qty * rate, 2)
            
            # Deductions
            shortage_qty = round(random.uniform(0, 0.5), 2) if random.random() > 0.8 else 0 # Small shortage
            deduction_amt = round(random.uniform(0, 500), 2) if random.random() > 0.9 else 0
            
            current_s_inv += 1

            # Costs
            transport_rate = round(random.uniform(20, 100), 2)
            
            # Payment
            net_payable = total_amount - (shortage_qty * rate) - deduction_amt
            status = random.choice(["paid", "pending", "partial"])
            paid = 0
            if status == "paid": paid = net_payable
            elif status == "partial": paid = round(net_payable / 2, 2)

            t = Transaction(
                date=create_random_date(),
                type="sale",
                invoice_number=current_s_inv,
                grain_id=grain.id,
                contact_id=contact.id,
                warehouse_id=warehouse.id,
                quantity_quintal=qty,
                number_of_bags=bags,
                rate_per_quintal=rate,
                total_amount=total_amount,
                shortage_quantity=shortage_qty,
                deduction_amount=deduction_amt,
                transport_cost_per_qtl=transport_rate,
                amount_paid=paid,
                payment_status=status,
                transporter_name=random.choice(["VRL", "TCI", "Local", "Self"]) if random.random() > 0.5 else None,
                vehicle_number=f"MP-{random.randint(10,99)}-{random.randint(1000,9999)}"
            )
            transactions.append(t)
            sales_count += 1
            
            # Deduct from Inventory
            inventory[key] -= qty

        print(f"Generated {sales_count} Sales.")
        print(f"Committing {len(transactions)} transactions to database...")
        session.add_all(transactions)
        
        # Verify Inventory Integrity
        print("Final Inventory Check (Internal):")
        for (g_id, w_id), qty in inventory.items():
            if qty < 0:
                 print(f"WARNING: Negative Inventory detected for Grain {g_id}, Wh {w_id}: {qty}")

        session.commit()
        print("Success! Database re-seeded.")

if __name__ == "__main__":
    print("WARNING: This will DELETE all existing transactions and inject mock records.")
    confirm = input("Type 'yes' to proceed: ")
    if confirm.lower() == "yes":
        seed_data()
    else:
        print("Cancelled.")
