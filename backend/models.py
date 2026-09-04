from sqlalchemy import Column, Integer, String, Float, DateTime, Boolean, ForeignKey
from sqlalchemy.ext.declarative import declarative_base
from datetime import datetime

Base = declarative_base()

class NGO(Base):
    __tablename__ = "ngos"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    reg_number = Column(String, unique=True, nullable=False)
    latitude = Column(Float, nullable=False)
    longitude = Column(Float, nullable=False)
    stream_path = Column(String, default="asha_kiran_live")
    reported_occupancy = Column(Integer, default=45)
    risk_score = Column(Float, default=0.85)

class Inspector(Base):
    __tablename__ = "inspectors"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    phone = Column(String, nullable=False)
    latitude = Column(Float, default=26.9124)
    longitude = Column(Float, default=75.7873)

class Inspection(Base):
    __tablename__ = "inspections"
    id = Column(Integer, primary_key=True, index=True)
    ngo_id = Column(Integer, ForeignKey("ngos.id"))
    inspector_id = Column(Integer, ForeignKey("inspectors.id"))
    scheduled_for = Column(DateTime, default=datetime.utcnow)
    status = Column(String, default="ASSIGNED")
    is_unlocked = Column(Boolean, default=True)
    proof_image_path = Column(String, nullable=True)
    verified_lat = Column(Float, nullable=True)
    verified_lon = Column(Float, nullable=True)