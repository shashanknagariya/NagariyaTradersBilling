# Product Requirements Document (PRD)

## 1. Background

**Business Overview:**
The grain trading and stocking business involves purchasing grains from small traders or farmers in varying quantities and selling them to mills or firms in other cities. Operations include grain quality checks, warehouse management, and handling payments for purchases, sales, and transportation. The aim is to automate this process with a web application to streamline operations, improve inventory management, and generate insightful reports.

**Key Grain Types:**
- Wheat (Gehu)
- Gram (Chana)
- Soybean
- Mustard (Sarso)
- Rice
- Sesame (Til)
- Mahua

## 2. Goals
1. Automate purchasing, selling, and inventory management.
2. Provide dynamic reporting capabilities.
3. Enable role-based user management for secure access.
4. Design a scalable, modular system for future extensibility.

## 3. Target Users
1. **Admins:** Manage users, roles, and system configurations.
2. **Helpers:** Oversee grain quality and warehouse operations.
3. **Accountants:** Handle billing, payment tracking, and reports.
4. **Owners:** Monitor overall business performance and insights.

## 4. Features

### Core Features
1. **Purchasing Module:**
   - Record purchase details (grain type, quantity, price, supplier, payment status).
   - Generate purchase bills.
   - Track pending payments.

2. **Inventory Management:**
   - Track grain inventory by warehouse.
   - Update inventory dynamically based on purchases and sales.

3. **Selling Module:**
   - Record sales details (grain type, quantity, price, buyer, broker commission).
   - Generate selling bills, transporter bilti, and mandi gate passes.
   - Adjust inventory after sales.

4. **Reporting Module:**
   - Generate inventory, purchase, sales, transport, and profit/loss reports.
   - Filter reports by grain type, time range, quarter, etc.

5. **User Management:**
   - Dynamic role and permission system.
   - Manage user access to modules and data.

### Non-Functional Requirements
1. **Performance:** Handle up to 1,000 transactions/day.
2. **Scalability:** Modular architecture for easy integration of new features.
3. **Security:** Role-based access and data encryption.
4. **Usability:** Intuitive UI with printable reports and bills.

## 5. Constraints
1. Use SQLite for initial database setup, with an option to migrate to a more robust DB later.
2. Implement modular architecture to avoid tight coupling.
3. Ensure compliance with GST and other financial regulations.



