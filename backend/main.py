import os
import shutil
from datetime import datetime
from fastapi import FastAPI, Depends, HTTPException, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, Session
from geopy.distance import geodesic

import models

DATABASE_URL = "sqlite:///./dosje.db"
engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
models.Base.metadata.create_all(bind=engine)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

os.makedirs("./uploads", exist_ok=True)

app = FastAPI(title="DoSJE Central Platform API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# 1. Root Healthcheck
@app.get("/")
def root():
    return {"status": "ONLINE", "message": "DoSJE Central Monitoring API"}

# 2. Database Seeder
@app.post("/seed")
def seed_data(db: Session = Depends(get_db)):
    db.query(models.Inspection).delete()
    db.query(models.NGO).delete()
    db.query(models.Inspector).delete()

    ngo = models.NGO(
        name="Asha Kiran Rehabilitation Center",
        reg_number="DoSJE-RJ-2026-001",
        latitude=26.8439,
        longitude=75.5652,
        stream_path="asha_kiran_live",
        reported_occupancy=45,
        risk_score=0.85,
    )
    inspector = models.Inspector(
        name="Rajesh Sharma (PMU-Jaipur)",
        phone="+91-9876543210",
        latitude=26.8500,
        longitude=75.5700,
    )
    db.add(ngo)
    db.add(inspector)
    db.commit()
    return {"status": "SUCCESS", "message": "Demo records created"}

# 3. NGO Endpoints (handles both /ngos and /ngos/all)
@app.get("/ngos")
@app.get("/ngos/all")
def get_all_ngos(db: Session = Depends(get_db)):
    return db.query(models.NGO).all()


from pydantic import BaseModel

class NGOReportUpdate(BaseModel):
    reported_occupancy: int
    staff_on_duty: int | None = 4
    remarks: str | None = "Regular daily log"

@app.post("/ngos/{ngo_id}/submit-report")
def submit_ngo_report(ngo_id: int, payload: NGOReportUpdate, db: Session = Depends(get_db)):
    ngo = db.query(models.NGO).filter(models.NGO.id == ngo_id).first()
    if not ngo:
        raise HTTPException(status_code=404, detail="NGO facility not found")
    
    # Update baseline occupancy numbers
    ngo.reported_occupancy = payload.reported_occupancy
    db.commit()
    db.refresh(ngo)
    return {
        "status": "success",
        "message": f"Updated compliance roll for {ngo.name}",
        "ngo_id": ngo.id,
        "reported_occupancy": ngo.reported_occupancy
    }

# 4. Inspection Endpoints (handles both /inspections and /inspections/all)
@app.get("/inspections")
@app.get("/inspections/all")
def get_all_inspections(db: Session = Depends(get_db)):
    return db.query(models.Inspection).all()

# 5. Automated Assignment Engine
@app.post("/inspections/auto-assign")
def auto_assign(db: Session = Depends(get_db)):
    ngos = db.query(models.NGO).all()
    inspectors = db.query(models.Inspector).all()

    if not ngos or not inspectors:
        raise HTTPException(status_code=400, detail="Database is empty. Execute /seed first.")

    target_ngo = max(ngos, key=lambda n: n.risk_score)
    assigned_inspector = min(
        inspectors,
        key=lambda i: geodesic((i.latitude, i.longitude), (target_ngo.latitude, target_ngo.longitude)).km,
    )

    inspection = models.Inspection(
        ngo_id=target_ngo.id,
        inspector_id=assigned_inspector.id,
        status="ASSIGNED",
        is_unlocked=True,
    )
    db.add(inspection)
    db.commit()
    db.refresh(inspection)
    return {"message": "Randomized duty assigned", "inspection": inspection}

# 6. Geo-Verified Check-In and Evidence Upload
@app.post("/inspections/{inspection_id}/verify-checkin")
async def verify_checkin(
    inspection_id: int,
    lat: float = Form(...),
    lon: float = Form(...),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    inspection = db.query(models.Inspection).filter(models.Inspection.id == inspection_id).first()
    if not inspection:
        raise HTTPException(status_code=404, detail="Inspection not found")

    ngo = db.query(models.NGO).filter(models.NGO.id == inspection.ngo_id).first()
    distance_meters = geodesic((lat, lon), (ngo.latitude, ngo.longitude)).meters

    # Strict 200m Geofence threshold
    if distance_meters > 200:
        inspection.status = "VIOLATION"
        db.commit()
        raise HTTPException(
            status_code=403,
            detail=f"Geofence violation! You are {int(distance_meters)}m away. Must be within 200m.",
        )

    file_path = f"./uploads/insp_{inspection_id}_{file.filename}"
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    inspection.status = "COMPLETED"
    inspection.verified_lat = lat
    inspection.verified_lon = lon
    inspection.proof_image_path = file_path
    db.commit()

    return {
        "status": "COMPLETED",
        "distance_meters": round(distance_meters, 2),
        "message": "Inspection verified on-site successfully.",
    }