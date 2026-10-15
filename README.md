# 🛡️ API Rate Limit Control Plane & Monitoring Dashboard

A high-performance, multi-tenant API Rate Limiting Control Plane and Reverse Proxy with real-time visual traffic metrics, dynamic policy management, and distributed Token Bucket enforcement.

Built with **FastAPI**, **Redis**, **React (Vite)**, and **Tailwind CSS**.

---

## 🌟 Key Highlights

- **Distributed Token Bucket Algorithm**: Sub-millisecond rate-limit checks using atomic Redis Lua scripts with zero race conditions (includes automatic in-memory fallback).
- **Multi-Tenant SaaS Isolation**: Tenant isolation per company with company-scoped API keys, policies, users, and request logs.
- **Dynamic Policy Management**: Create, edit, toggle, and delete rate-limit policies on the fly without restarting services (custom burst capacity, refill tokens, refill intervals, and HTTP methods).
- **Real-Time Live Metrics & Spike Graph**: Interactive canvas-based traffic visualization (Allowed vs. 429 Rejected spikes), endpoint filtering, and real-time auto-refreshing stats.
- **Reverse Proxy & Upstream Forwarding**: Transparently forwards compliant traffic to target upstream services or internal mock endpoints.
- **Role-Based Access Control (RBAC)**: Enforces Owner vs. Viewer permissions for policy editing and team management.
- **Dummy Simulator Client**: Built-in multi-tenant client simulator capable of firing true simultaneous concurrent bursts (`Promise.all`) to test rate-limit thresholds.

---

## 🏗️ System Architecture

```
                    [ Incoming Client / Simulator Traffic ]
                                      │
                                      ▼
                      ┌───────────────────────────────┐
                      │    FastAPI Rate Limit Proxy   │
                      └───────────────┬───────────────┘
                                      │
                 ┌────────────────────┴────────────────────┐
                 ▼                                         ▼
   ┌───────────────────────────┐             ┌───────────────────────────┐
   │    Redis Token Bucket     │             │     PostgreSQL / SQLite   │
   │  (Atomic Lua Evaluation)  │             │ (Policies, Users, Logs)   │
   └─────────────┬─────────────┘             └─────────────┬─────────────┘
                 │                                         │
        [ Allowed / 429 ]                                  │
                 │                                         │
                 ▼                                         ▼
   ┌───────────────────────────┐             ┌───────────────────────────┐
   │ Upstream Service / Demo   │             │   React Live Dashboard    │
   │    (200 OK / Response)    │             │  (Canvas Metrics & Spike) │
   └───────────────────────────┘             └───────────────────────────┘
```

---

## 🛠️ Tech Stack

| Layer | Technologies |
|---|---|
| **Backend** | Python 3.10+, FastAPI, SQLAlchemy, Redis (Lua Scripts), Pydantic v2, Python-Jose (JWT), Passlib (Bcrypt) |
| **Frontend** | React 18, Vite, Tailwind CSS, HTML5 Canvas API |
| **Testing Client** | Standalone HTML5 / Vanilla JS True Concurrent Simulator |
| **Database** | SQLite (Local Dev) / PostgreSQL (Production), Redis |
| **DevOps & Containers** | Docker, Docker Compose, Render (`render.yaml`) |

---

## 📁 Project Directory Structure

```text
ojt/
├── backend/                  # FastAPI Control Plane & Proxy Engine
│   ├── app/
│   │   ├── auth.py           # JWT generation, verification, password hashing
│   │   ├── bucket.py         # Token bucket rate-limiting logic (Redis Lua + fallback)
│   │   ├── database.py       # SQLAlchemy engine & session management
│   │   ├── main.py           # FastAPI routes, middleware, reverse proxy engine
│   │   ├── metrics.py        # Analytics aggregation & timeline bucket calculations
│   │   ├── models.py         # DB models (Company, User, Policy, RequestLog)
│   │   └── schemas.py        # Pydantic request/response schemas
│   ├── tests/                # Pytest unit & integration test suites
│   ├── Dockerfile
│   └── requirements.txt
├── frontend/                 # React Control Plane & Live Dashboard
│   ├── src/
│   │   ├── App.jsx           # Main application container & tab router
│   │   ├── AuthScreen.jsx    # Signup & Login interface
│   │   ├── Dashboard.jsx     # Live spike graph, metric cards, policy filter
│   │   ├── PolicyManager.jsx # Rate limit policy configuration & CRUD
│   │   ├── ManageUsers.jsx   # Team member RBAC management
│   │   └── api.js            # Axios/Fetch wrapper with JWT handling
│   ├── package.json
│   └── vite.config.js
├── dummy-client/             # Multi-Company Concurrent Load Simulator
│   └── index.html            # Single / burst request tester
├── tracker/                  # Lightweight client telemetry script
│   └── tracker.js
├── docker-compose.yml        # Multi-container orchestration (App + Redis)
└── README.md
```

---

## 🚀 Quickstart & Setup Guide

### 1. Prerequisites
- **Python 3.10+**
- **Node.js 18+** & `npm`
- **Redis** (optional for local dev; built-in in-memory fallback enabled)

---

### 2. Backend Setup

```bash
# Navigate to backend directory
cd backend

# Create & activate a virtual environment (optional but recommended)
python -m venv venv
# Windows:
venv\Scripts\activate
# Linux/macOS:
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Run the FastAPI server
uvicorn app.main:app --reload --port 8000
```
Backend API will be available at: **`http://localhost:8000`**  
Interactive Swagger Docs: **`http://localhost:8000/docs`**

---

### 3. Frontend Setup

```bash
# Open a new terminal and navigate to frontend directory
cd frontend

# Install dependencies
npm install

# Start the Vite development server
npm run dev
```
Dashboard will be available at: **`http://localhost:5173`**

---

### 4. Running the Dummy Simulator Client

Simply open the file in any browser:
```text
ojt/dummy-client/index.html
```
Or serve it via any static server (e.g., Live Server in VS Code).

---

## 🐳 Running with Docker Compose

To spin up the entire stack (FastAPI Backend, Redis, and React Frontend) with a single command:

```bash
docker-compose up --build
```

---

## 🧪 How to Test Rate Limiting & View the Live Graph

1. **Sign Up / Log In**:
   - Open `http://localhost:5173`.
   - Register a new account or log in.
2. **Create a Rate Limit Policy**:
   - Go to the **Policy Management** tab.
   - Example Policy:
     - **Name**: `Login Limiter`
     - **Endpoint**: `/demo/login`
     - **Method**: `POST`
     - **Burst Capacity**: `5` tokens
     - **Refill Tokens**: `5`
     - **Refill Seconds**: `60`
   - Click **Create Policy**.
3. **Simulate Traffic from Dummy Client**:
   - Open `dummy-client/index.html`.
   - Select `/demo/login` with method `POST`.
   - Set Burst Amount to `10 Requests` and click **Send True Concurrent Burst 🚀**.
   - Notice the first 5 succeed with `200 OK` and the subsequent 5 are blocked with `429 Too Many Requests`.
4. **View Real-Time Spike Graph**:
   - Return to the **Live Metrics** dashboard.
   - Click the **dropdown arrow** next to the graph — your newly created policy `/demo/login (Login Limiter)` appears in the list!
   - Select it to filter the spike graph: **Blue bars** show allowed traffic, and **Red bars** show rejected spikes.

---

## 📊 Core API Endpoints

### 🔐 Authentication & Team
- `POST /auth/signup` - Register company tenant and owner account
- `POST /auth/login` - Authenticate and receive JWT access token
- `GET /auth/me` - Fetch profile of current authenticated user
- `GET /auth/users` - List all company team members (Owner only)
- `POST /auth/users` - Invite a viewer or admin to the company

### 📋 Policies (Rate Limit Configuration)
- `GET /policies` - List all active policies for the company
- `POST /policies` - Create a new rate-limit policy rule
- `PATCH /policies/{id}` - Update rule parameters (capacity, refill rate)
- `PATCH /policies/{id}/status` - Enable or disable a policy
- `DELETE /policies/{id}` - Remove a policy rule

### 📈 Metrics & Monitoring
- `GET /metrics/summary?minutes=60` - Total, allowed, and rejected counts
- `GET /metrics/endpoints?minutes=60` - Endpoint breakdown ranked by traffic
- `GET /metrics/timeline?minutes=30&endpoint=/path` - Time-bucketed spike chart data
- `GET /metrics/recent?limit=30` - Chronological audit log of requests

---

## 🧪 Running Tests

Run the backend test suite:
```bash
cd backend
pytest
```

---

## 📜 License
This project is licensed under the [MIT License](LICENSE).