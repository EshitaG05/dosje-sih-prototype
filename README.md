# DoSJE Autonomous Surveillance & PMU Assurance Platform

An automated monitoring, computer-vision attendance verification, and surprise inspection dispatch engine engineered for the **Department of Social Justice and Empowerment (DoSJE)**.
The system replaces manual, scheduled inspections with an autonomous audit pipeline featuring real-time occupancy cross-checking, algorithmic duty allocation, and strict geofencing.

---

## Key Capabilities

* **Command Operations Center (React / Vite):** Unified administrative console featuring live surveillance streams, risk index scoring, and real-time inspection registries.
* **Autonomous Computer Vision Engine (TensorFlow.js / COCO-SSD):** In-browser neural person detection running directly on webcam/CCTV streams. Flags potential ghost beneficiaries by cross-referencing visual headcounts against declared grant occupancy.
* **Geofence Proximity Enforcement (FastAPI / Geopy):** Mathematical distance validation rejecting inspection check-ins outside a strict 200-meter radius around registered facility coordinates.
* **Anti-Collusion Blind Duty Allocation:** Uses a geodesic min-max formula to pair the nearest field officer to the highest-risk center, locking facility identities behind a timed window to eliminate advance notice.
* **Dual-View Field Terminal:** Mobile inspector client with native HTML5 GPS sensor locking, proof submission, and live distance feedback.
* **Statutory Compliance Dossier (jsPDF):** One-click export of official, timestamped PDF audit reports bearing verification metrics and cryptographic SHA-256 integrity stamps.

---

## Tech Stack

| Layer | Technologies |
| :--- | :--- |
| **Frontend** | React 18, Vite, Lucide Icons, Leaflet / React-Leaflet |
| **Vision & AI** | TensorFlow.js, COCO-SSD (`lite_mobilenet_v2`) |
| **Backend API** | Python, FastAPI, Uvicorn, SQLAlchemy, Geopy |
| **Database** | SQLite (`dosje.db`) |
| **Reporting** | jsPDF |

---

## Project Structure

```text
dosje/
├── backend/
│   ├── main.py              # FastAPI application, geofence validation, and assignment routes
│   ├── models.py            # SQLAlchemy database schemas (NGO, Inspector, Inspection)
│   ├── database.py          # Session and engine configuration
│   └── uploads/             # Storage for geo-tagged audit proof captures
├── frontend/
│   ├── src/
│   │   ├── App.jsx          # Dual-view interface (PMU Console vs Inspector App)
│   │   ├── GeoFenceMap.jsx  # Leaflet map rendering with 200m radius perimeter
│   │   └── main.jsx         # React application root
│   ├── index.html           # Leaflet stylesheets and app mount
│   └── package.json
├── streaming/               # Video streaming scripts and RTSP/MediaMTX configurations
└── .gitignore

```

---

## Setup & Running the Project

### Prerequisites

* **Node.js**: v18+ and npm
* **Python**: v3.10+
* **Git**

---

### 1. Backend Setup

Open a terminal and navigate to `backend`:

```powershell
cd backend
python -m venv venv
.\venv\Scripts\activate
pip install fastapi uvicorn sqlalchemy geopy python-multipart

```

Start the FastAPI backend server:

```powershell
uvicorn main:app --reload

```

* Backend runs at `http://127.0.0.1:8000`
* Interactive API docs are at `http://127.0.0.1:8000/docs`

#### Seed Initial Records

In a second terminal, populate the database with default facilities and inspectors:

```powershell
Invoke-RestMethod -Method Post [http://127.0.0.1:8000/seed](http://127.0.0.1:8000/seed)

```

---

### 2. Frontend Setup

Open a new terminal window and navigate to `frontend`:

```powershell
cd frontend
npm install
npm run dev

```

* Access the dashboard at `http://localhost:5173`

---
