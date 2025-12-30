# API Reference Documentation

## Overview

The backend is built with **FastAPI** (Python). All endpoints return JSON.

**Base URL**: `https://your-backend-url.com` (or `http://127.0.0.1:8000` locally)

**Authentication**: JWT Bearer Token (required for most endpoints).

---

## Authentication

### `POST /auth/login`

Login and get access token.

**Request (Form Data)**:
| Field | Type | Description |
|-------|------|-------------|
| `username` | string | Username |
| `password` | string | Password |

**Response**:
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "token_type": "bearer",
  "user": {
    "id": 1,
    "username": "admin",
    "role": "admin",
    "permissions": ["all"]
  }
}
```

---

### `GET /auth/me`

Get current user info.

**Headers**: `Authorization: Bearer <token>`

**Response**:
```json
{
  "id": 1,
  "username": "admin",
  "role": "admin",
  "permissions": ["all"],
  "token_version": 1
}
```

---

### `POST /auth/setup`

Initial admin setup (only works if no users exist).

**Request**:
```json
{
  "username": "admin",
  "password": "securepassword"
}
```

**Response**:
```json
{ "message": "Admin created" }
```

---

## User Management (Admin Only)

### `GET /users/`

List all users.

**Headers**: `Authorization: Bearer <admin_token>`

**Response**: Array of `UserRead` objects.

---

### `POST /users/`

Create a new user.

**Request**:
```json
{
  "username": "worker1",
  "password": "password123",
  "role": "worker",
  "permissions": ["purchase", "inventory"]
}
```

---

### `PUT /users/{user_id}`

Update a user (password, role, permissions).

**Request**:
```json
{
  "password": "newpassword",
  "role": "admin",
  "permissions": ["all"]
}
```

---

## Master Data

### Grains

#### `GET /master/grains`

Get all grains.

**Response**:
```json
[
  { "id": 1, "name": "Wheat", "hindi_name": "Gehu" },
  { "id": 2, "name": "Rice", "hindi_name": "Chawal" }
]
```

#### `POST /master/grains`

Create a grain.

**Request**:
```json
{ "name": "Barley", "hindi_name": "Jau" }
```

---

### Warehouses

#### `GET /master/warehouses`

Get all warehouses.

**Response**:
```json
[
  { "id": 1, "name": "Main Godown", "location": "City Center" }
]
```

#### `POST /master/warehouses`

Create a warehouse.

**Request**:
```json
{ "name": "Godown 2", "location": "Industrial Area" }
```

---

### Contacts

#### `GET /master/contacts`

Get all contacts.

**Response**:
```json
[
  { "id": 1, "name": "Ram Kumar", "type": "supplier", "phone": "9876543210", "gst_number": null },
  { "id": 2, "name": "ABC Traders", "type": "buyer", "phone": null, "gst_number": "27XXXXX1234Z" }
]
```

#### `POST /master/contacts`

Create a contact.

**Request**:
```json
{ "name": "New Farmer", "type": "supplier", "phone": "9123456789" }
```

---

## Transactions

### `POST /transactions/`

Create a **Purchase** transaction.

**Request**:
```json
{
  "type": "purchase",
  "grain_id": 1,
  "contact_id": 1,
  "warehouse_id": 1,
  "quantity_quintal": 50.5,
  "number_of_bags": 100,
  "rate_per_quintal": 2500,
  "total_amount": 126250,
  "payment_status": "pending",
  "notes": "100 Bags @ 60kg",
  "labour_cost_per_bag": 3
}
```

**Logic**: 
- `total_amount` is recalculated as `(qty × rate) - (bags × labour_cost)` for purchases.
- `invoice_number` is auto-generated.

---

### `POST /transactions/bulk_sale`

Create a **Sale** bill (multi-warehouse).

**Request**:
```json
{
  "contact_id": 2,
  "grain_id": 1,
  "rate_per_quintal": 2800,
  "bharti": 60,
  "tax_percentage": 5,
  "labour_cost_per_bag": 3,
  "transport_cost_per_qtl": 50,
  "transporter_name": "XYZ Transport",
  "destination": "Delhi",
  "driver_name": "Raj",
  "vehicle_number": "HR-55-1234",
  "warehouses": [
    { "warehouse_id": 1, "bags": 50 },
    { "warehouse_id": 2, "bags": 30 }
  ]
}
```

**Logic**:
- Stock is validated per warehouse before sale.
- All warehouse allocations share the same `invoice_number` and `sale_group_id`.
- `cost_price_per_quintal` is auto-calculated from average purchase price.
- `expenses_total` = `(bags × labour) + (qty × transport)`.

**Error Response** (insufficient stock):
```json
{ "detail": "Insufficient stock in Main Godown. Available: 20.00 Qtl, Requested: 30.00 Qtl" }
```

---

### `GET /transactions/`

Get all transactions.

**Query Params**:
| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `skip` | int | 0 | Pagination offset |
| `limit` | int | 100 | Max items |

---

### `GET /transactions/bill/{transaction_id}`

Get all transactions belonging to the same bill (for grouped sales).

**Response**: Array of `Transaction` objects.

---

### `PUT /transactions/{transaction_id}`

Update a transaction.

**Request** (partial update):
```json
{
  "shortage_quantity": 0.5,
  "deduction_amount": 500,
  "deduction_note": "Quality claim"
}
```

---

### `DELETE /transactions/{transaction_id}`

Delete a transaction.

**Note**: This action will **cascade delete** all associated `PaymentHistory` records.

---

## Payments

### `POST /transactions/{transaction_id}/payment`

Record a payment.

**Request**:
```json
{ "amount": 50000 }
```

**Logic**:
- Validates against overpayment.
- Updates `amount_paid` and `payment_status`.
- Creates a `PaymentHistory` record.

**Error Response**:
```json
{ "detail": "Cannot accept ₹60000. Max receivable is ₹50000.00" }
```

---

### `GET /transactions/{transaction_id}/payments`

Get payment history for a transaction.

**Response**:
```json
[
  { "id": 1, "transaction_id": 5, "amount": 25000, "date": "2024-12-25T10:00:00", "notes": null },
  { "id": 2, "transaction_id": 5, "amount": 25000, "date": "2024-12-28T14:30:00", "notes": null }
]
```

---

## Inventory

### `GET /inventory/`

Get current inventory status (aggregated).

**Response**:
```json
[
  {
    "grain_id": 1,
    "grain_name": "Wheat",
    "hindi_name": "Gehu",
    "total_bags": 500,
    "total_quintal": 300.0,
    "average_price": 2450.50,
    "warehouses": [
      { "id": 1, "name": "Main Godown", "bags": 300, "quintal": 180.0 },
      { "id": 2, "name": "Godown 2", "bags": 200, "quintal": 120.0 }
    ]
  }
]
```

---

## Dashboard Stats

### `GET /stats/dashboard`

Get summary stats for the dashboard.

**Response**:
```json
{
  "total_receivable": 125000.0,
  "total_payable": 50000.0,
  "total_inventory_value": 750000.0
}
```

**Logic**:
- `total_receivable`: Pending amount from sales (adjusted for shortage/deductions).
- `total_payable`: Pending amount to suppliers.
- `total_inventory_value`: Current stock × average purchase price.

---

## Error Handling

All errors return JSON with `detail` field:

```json
{
  "detail": "Error message here"
}
```

| HTTP Code | Meaning |
|-----------|---------|
| 400 | Bad Request (validation failed, insufficient stock, etc.) |
| 401 | Unauthorized (invalid/expired token) |
| 403 | Forbidden (admin-only endpoint) |
| 404 | Not Found |
| 500 | Internal Server Error |

---

## Authentication Flow

1. User calls `POST /auth/login` with credentials.
2. Server returns JWT token.
3. Client stores token in secure storage.
4. Client sends `Authorization: Bearer <token>` header with all requests.
5. Token expires after 24 hours.
6. If user password is changed, `token_version` increments, invalidating old tokens.
