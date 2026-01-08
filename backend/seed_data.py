import random
from datetime import datetime, timedelta
from sqlmodel import Session, select
from database import engine
from models import Grain, Contact, Warehouse, Transaction

def create_random_date():
    start_date = datetime.now() - timedelta(days=365)
    random_days = random.randrange(365)
    return start_date + timedelta(days=random_days)

def seed_data():
    with Session(engine) as session:
        print("Fetching Master Data...")
        grains = session.exec(select(Grain)).all()
        contacts = session.exec(select(Contact)).all()
        warehouses = session.exec(select(Warehouse)).all()

        if not grains or not contacts or not warehouses:
            print("Error: Missing master data. Please add at least one Grain, Contact, and Warehouse via the app first.")
            return

        transactions = []
        
        # 1. Purchases
        print("Generating 1000 Purchases...")
        for _ in range(1000):
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
            
            t = Transaction(
                date=create_random_date(),
                type="purchase",
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

        # 2. Sales
        print("Generating 1000 Sales...")
        for _ in range(1000):
            grain = random.choice(grains)
            contact = random.choice(contacts)
            warehouse = random.choice(warehouses)
            
            qty = round(random.uniform(10, 200), 2)
            rate = round(random.uniform(2500, 6000), 2) # Slightly higher than purchase
            bags = int(qty * 2)
            
            total_amount = round(qty * rate, 2)
            
            # Deductions
            shortage_qty = round(random.uniform(0, 2), 2) if random.random() > 0.7 else 0
            deduction_amt = round(random.uniform(0, 1000), 2) if random.random() > 0.8 else 0
            
            # Costs
            transport_rate = round(random.uniform(20, 100), 2)
            transport_total = round(qty * transport_rate, 2)
            
            # Payment (Net Realized logic simplification for seed)
            net_payable = total_amount - (shortage_qty * rate) - deduction_amt
            
            status = random.choice(["paid", "pending", "partial"])
            paid = 0
            if status == "paid": paid = net_payable
            elif status == "partial": paid = round(net_payable / 2, 2)

            t = Transaction(
                date=create_random_date(),
                type="sale",
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

        print(f"Committing {len(transactions)} transactions to database...")
        session.add_all(transactions)
        session.commit()
        print("Success! Database seeded.")

if __name__ == "__main__":
    print("WARNING: This will inject 2000 mock records into your ACTIVE database.")
    confirm = input("Type 'yes' to proceed: ")
    if confirm.lower() == "yes":
        seed_data()
    else:
        print("Cancelled.")
