from typing import Optional
from sqlmodel import Field, SQLModel
from datetime import datetime



class Grain(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    name: str = Field(index=True, unique=True)  # Wheat, Rice, etc.
    hindi_name: Optional[str] = None # Gehu, Chana
    standard_bharti: float = Field(default=60.0)

class Warehouse(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    name: str
    location: Optional[str] = None

class Contact(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    name: str
    type: str  # supplier, buyer, broker
    phone: Optional[str] = None
    gst_number: Optional[str] = None

class Transaction(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    date: datetime = Field(default_factory=datetime.utcnow)
    type: str  # purchase, sale
    invoice_number: Optional[int] = None
    
    grain_id: int = Field(foreign_key="grain.id")
    contact_id: int = Field(foreign_key="contact.id")
    warehouse_id: int = Field(foreign_key="warehouse.id")
    
    quantity_quintal: float
    number_of_bags: Optional[float] = None
    rate_per_quintal: float
    total_amount: float
    
    tax_percentage: float = Field(default=0.0)
    cost_price_per_quintal: float = Field(default=0.0)
    amount_paid: float = Field(default=0.0)
    payment_status: str = Field(default="pending") # pending, paid, partial
    notes: Optional[str] = None
    extra_loose_quantity: float = Field(default=0.0)

    # Sale specific details
    transporter_name: Optional[str] = None
    destination: Optional[str] = None
    driver_name: Optional[str] = None
    vehicle_number: Optional[str] = None
    sale_group_id: Optional[str] = None # To group multiple rows of a single bill
    
    # Settlement / Deductions (Sale only)
    shortage_quantity: float = Field(default=0.0) # Quantity lost/short
    deduction_amount: float = Field(default=0.0) # Monetary deduction (quality claim etc)
    deduction_note: Optional[str] = None

    # New Cost fields (Purchase & Sale)
    labour_cost_per_bag: float = Field(default=3.0) 
    transport_cost_per_qtl: float = Field(default=0.0)
    mandi_cost: float = Field(default=0.0) # Total Mandi Cost (distributed)
    
    # Store calculated totals
    labour_cost_total: float = Field(default=0.0) # Used in Purchase to deduct
    expenses_total: float = Field(default=0.0) # Sale: Labour + Transport (Hidden)

class PaymentHistory(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    transaction_id: int = Field(foreign_key="transaction.id")
    amount: float
    date: datetime = Field(default_factory=datetime.utcnow)
    notes: Optional[str] = None

class User(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    username: str = Field(index=True, unique=True)
    password_hash: str
    role: str = Field(default="worker") # 'admin', 'worker'
    permissions: str = Field(default="[]") # JSON list of allowed modules
    token_version: int = Field(default=1)

# Pydantic Schemas for API
class TransactionCreate(SQLModel):
    date: datetime = Field(default_factory=datetime.utcnow)
    type: str
    grain_id: int
    contact_id: int
    warehouse_id: int
    quantity_quintal: float
    rate_per_quintal: float
    total_amount: float
    invoice_number: Optional[int] = None
    transporter_name: Optional[str] = None
    driver_name: Optional[str] = None
    vehicle_number: Optional[str] = None
    # Deductions optional on create
    shortage_quantity: Optional[float] = 0.0
    deduction_amount: Optional[float] = 0.0
    deduction_note: Optional[str] = None
    extra_loose_quantity: Optional[float] = 0.0

class TransactionUpdate(SQLModel):
    date: Optional[datetime] = None
    quantity_quintal: Optional[float] = None
    rate_per_quintal: Optional[float] = None
    total_amount: Optional[float] = None
    invoice_number: Optional[int] = None
    transporter_name: Optional[str] = None
    shortage_quantity: Optional[float] = None
    deduction_amount: Optional[float] = None
    deduction_note: Optional[str] = None
    payment_status: Optional[str] = None
    amount_paid: Optional[float] = None

class TransactionRead(Transaction):
    grain_name: str
    contact_name: str
    warehouse_name: str

class DispatchInfo(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    sale_group_id: str = Field(index=True) # Link to all transactions in this bill
    
    # Copied from Main for reference/editing specific to Dispatch
    transporter_name: Optional[str] = None
    vehicle_number: Optional[str] = None
    driver_name: Optional[str] = None
    
    # Financials
    rate: float = Field(default=0.0) # Rate per quintal
    total_weight: float = Field(default=0.0)
    gross_freight: float = Field(default=0.0) # Total Payable before deductions
    
    # Payments
    advance_paid: float = Field(default=0.0)
    delivery_paid: float = Field(default=0.0)
    
    # Deductions
    shortage_deduction: float = Field(default=0.0)
    other_deduction: float = Field(default=0.0)
    deduction_note: Optional[str] = None
    
    status: str = Field(default="pending") # pending, cleared
