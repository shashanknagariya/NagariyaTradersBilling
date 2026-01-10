from sqlmodel import Session, delete
from database import engine
from models import Transaction, PaymentHistory, DispatchInfo

def delete_all_data():
    with Session(engine) as session:
        print("Deleting PaymetHistory...")
        session.exec(delete(PaymentHistory))
        
        print("Deleting DispatchInfo...")
        session.exec(delete(DispatchInfo))
        
        print("Deleting Transactions...")
        session.exec(delete(Transaction))
        
        session.commit()
        print("All bills and related data have been deleted successfully.")

if __name__ == "__main__":
    delete_all_data()
