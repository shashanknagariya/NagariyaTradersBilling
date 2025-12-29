# 🌾 Nagariya Traders Billing App

A full-stack mobile application for grain trading billing, inventory management, and financial reporting. Built with **React Native (Expo)** and **FastAPI (Python)**.

---

## 🚀 Features
- **Billing**: Create Sales & Purchase bills with PDF generation.
- **Inventory**: Real-time stock tracking across multiple warehouses.
- **Settlement**: Handle weight shortages and quality deductions.
- **Reports**: Profit/Loss analysis, financial overview, and CSV exports.
- **Role-Based Access**: Safe mode for workers (hidden financials) vs Admin.

---

## 🛠️ Prerequisites
Before running the app, ensure you have:
1.  **Node.js**: [Download Here](https://nodejs.org/) (LTS recommended).
2.  **Python**: [Download Here](https://www.python.org/) (v3.10+).
3.  **Expo Go App**: Install on your Android/iOS phone from Play Store/App Store.
4.  **Git**: [Download Here](https://git-scm.com/).

---

## 💻 Running Locally (Development)

This setup uses a **Local SQLite Database**. Easy for testing.

### 1. Backend Setup (Server)
Open a terminal in the `backend` folder.

```bash
cd backend
# Create Virtual Environment
python -m venv venv

# Activate Virtual Environment
# Windows:
.\venv\Scripts\activate
# Mac/Linux:
# source venv/bin/activate

# Install Dependencies
pip install -r requirements.txt

# Create .env file (Optional for local, but good practice)
# You can leave it empty or add SECRET_KEY="dev-secret"

# Run Server
uvicorn main:app --host 127.0.0.1 --port 8000 --reload
```
*   Server runs at: `http://127.0.0.1:8000`
*   Docs (Swagger UI): `http://127.0.0.1:8000/docs`

### 2. Frontend Setup (App)
Open a new terminal in the `frontend` folder.

```bash
cd frontend

# Install Node Dependencies
npm install

# Start Expo
npx expo start
```
*   Scan the QR code with your **Expo Go** app on your phone.
*   **Note**: Ensure your phone and computer are on the **same Wi-Fi**.

---

## ☁️ Running in Production (Cloud)

This setup uses **Supabase (PostgreSQL)** and **Render (Cloud Hosting)**.

### 1. Database & Backend (Cloud)
We use `database.py` logic to switch DBs automatically:
*   **Local**: Uses `grain_trading_v11.db` (SQLite).
*   **Cloud**: Only matches if `DATABASE_URL` is present in Environment Variables.

**To Deploy to Render:**
1.  Push code to GitHub.
2.  Create New Web Service on [Render.com](https://render.com).
3.  Connect GitHub Repo.
4.  **Build Command**: `pip install -r requirements.txt`
5.  **Start Command**: `uvicorn main:app --host 0.0.0.0 --port 10000`
6.  **Environment Variables**:
    *   `DATABASE_URL`: `postgresql://postgres:[PASSWORD]@aws-0-ap-south-1.pooler.supabase.com:6543/postgres`
    *   `SECRET_KEY`: `[YOUR_GENERATED_SECRET_KEY]`

### 2. Frontend (APK Build)
We use `client.js` logic to switch API URL automatically:
*   **Dev Mode**: Points to `127.0.0.1:8000` (or `10.0.2.2`).
*   **Prod Mode**: Points to `https://nagariyatradersbilling.onrender.com`.

**To Build APK:**
1.  Install EAS CLI: `npm install -g eas-cli`
2.  Login: `eas login`
3.  Build:
    ```bash
    eas build --profile preview --platform android
    ```
4.  Download and install the APK link sent to your email.

---

## ⚠️ Important Configuration Files

### `frontend/src/api/client.js`
Controls where the App connects to.
```javascript
// Switches automatically!
const baseURL = __DEV__ 
    ? 'http://127.0.0.1:8000' // Local
    : 'https://nagariyatradersbilling.onrender.com'; // Production
```

### `backend/database.py`
Controls which database is used.
```python
# Switches automatically!
DATABASE_URL = os.environ.get("DATABASE_URL")
if DATABASE_URL:
    # Use Cloud (Postgres)
else:
    # Use Local (SQLite)
```

---

## ❓ Troubleshooting

*   **App cannot connect to Server (Network Error)?**
    *   Ensure phone & PC are on the same Wi-Fi.
    *   Check your PC's local IP (run `ipconfig`) and update `client.js` if needed (e.g., `http://192.168.1.5:8000`).
*   **"Insufficient Stock" Error?**
    *   You are trying to sell more than you have. Add a Purchase Bill first.
