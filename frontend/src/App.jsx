import React, { useState, useEffect, useRef } from "react";
import { Video, ShieldAlert, CheckCircle, RefreshCw, Send, PhoneCall, UserCheck, Eye } from "lucide-react";
import * as tf from "@tensorflow/tfjs";
import * as cocoSsd from "@tensorflow-models/coco-ssd";

export default function App() {
  const [ngos, setNgos] = useState([]);
  const [inspections, setInspections] = useState([]);
  const [uploadResult, setUploadResult] = useState(null);
  const [liveHeadcount, setLiveHeadcount] = useState(0);
  const [isAiLoading, setIsAiLoading] = useState(true);
  const [isCalling, setIsCalling] = useState(false);

  const videoRef = useRef(null);
  const modelRef = useRef(null);

  // 1. Camera Initialization with cleanup
  useEffect(() => {
    let activeStream = null;

    async function startCamera() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 640 }, height: { ideal: 480 } },
          audio: false,
        });
        activeStream = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
      } catch (err) {
        console.error("Camera access error:", err);
      }
    }

    startCamera();

    return () => {
      if (activeStream) {
        activeStream.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  // 2. Load lightweight COCO-SSD Model
  useEffect(() => {
    async function loadModel() {
      try {
        setIsAiLoading(true);
        await tf.ready();
        const model = await cocoSsd.load({ base: "lite_mobilenet_v2" });
        modelRef.current = model;
        setIsAiLoading(false);
      } catch (err) {
        console.error("Failed to load COCO-SSD model:", err);
      }
    }
    loadModel();
  }, []);

  // 3. Frame-by-Frame Person Detection
  useEffect(() => {
    let intervalId;

    async function detectPeople() {
      if (
        modelRef.current &&
        videoRef.current &&
        videoRef.current.readyState === 4
      ) {
        try {
          const predictions = await modelRef.current.detect(videoRef.current);
          // Filter exclusively for human beings detected in the camera frame
          const people = predictions.filter(
            (item) => item.class === "person" && item.score > 0.45
          );
          setLiveHeadcount(people.length);
        } catch (e) {
          console.error("Detection error:", e);
        }
      }
    }

    intervalId = setInterval(detectPeople, 1000);
    return () => clearInterval(intervalId);
  }, []);

  // 4. State Synchronization with Backend
  const syncState = async () => {
    try {
      const nRes = await fetch("http://127.0.0.1:8000/ngos");
      setNgos(await nRes.json());
      const iRes = await fetch("http://127.0.0.1:8000/inspections");
      setInspections(await iRes.json());
    } catch (e) {
      console.error("Sync error:", e);
    }
  };

  useEffect(() => {
    syncState();
    const interval = setInterval(syncState, 4000);
    return () => clearInterval(interval);
  }, []);

  const triggerAssignment = async () => {
    await fetch("http://127.0.0.1:8000/inspections/auto-assign", { method: "POST" });
    syncState();
  };

  const simulateCheckin = async (dutyId) => {
    const formData = new FormData();
    formData.append("lat", "26.8440");
    formData.append("lon", "75.5653");

    const dummyBlob = new Blob([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])], { type: "image/png" });
    formData.append("file", dummyBlob, "field_capture.png");

    const res = await fetch(`http://127.0.0.1:8000/inspections/${dutyId}/verify-checkin`, {
      method: "POST",
      body: formData,
    });
    const result = await res.json();
    setUploadResult(result);
    syncState();
  };

  const activeNgo = ngos[0] || { name: "Asha Kiran Rehabilitation Center", risk_score: 0.88, reported_occupancy: 45 };
  const hasDiscrepancy = liveHeadcount < (activeNgo.reported_occupancy * 0.2);

  return (
    <div className="app-container">
      {/* Sidebar */}
      <aside className="sidebar">
        <div>
          <h2 style={{ color: "#38bdf8", fontSize: "18px", fontWeight: "bold" }}>DoSJE Surveillance</h2>
          <p style={{ color: "#6b7280", fontSize: "12px", marginTop: "4px" }}>Autonomous Monitoring PMU</p>
          <div style={{ marginTop: "32px", display: "flex", flexDirection: "column", gap: "10px" }}>
            <span style={{ color: "#f3f4f6", fontWeight: 600 }}>Live Command Center</span>
            <span style={{ color: "#6b7280" }}>Audit Logs</span>
          </div>
        </div>
        <button className="btn btn-blue" onClick={triggerAssignment}>
          + Trigger Surprise Audit
        </button>
      </aside>

      {/* Main Content */}
      <main className="content">
        <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <h1 style={{ fontSize: "22px", fontWeight: "bold" }}>Command Operations Center</h1>
            <p style={{ color: "#9ca3af", fontSize: "14px" }}>Autonomous verification & live stream feed</p>
          </div>
          <button className="btn" style={{ background: "#1f2937", color: "#fff" }} onClick={syncState}>
            <RefreshCw size={16} />
          </button>
        </header>

        {/* AI Discrepancy Banner */}
        {hasDiscrepancy && (
          <div style={{ marginTop: "18px", padding: "14px 18px", background: "rgba(220, 38, 38, 0.15)", border: "1px solid #dc2626", borderRadius: "8px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              <ShieldAlert color="#ef4444" size={24} />
              <div>
                <span style={{ color: "#f87171", fontWeight: "bold", fontSize: "14px" }}>CRITICAL ATTENDANCE ANOMALY DETECTED</span>
                <p style={{ color: "#cbd5e1", fontSize: "12px" }}>
                  Visual AI Headcount is <b>{liveHeadcount}</b>, but reported grant occupancy is <b>{activeNgo.reported_occupancy}</b>. High risk of proxy/ghost records!
                </p>
              </div>
            </div>
            <button className="btn btn-red" onClick={() => setIsCalling(true)}>
              Launch Emergency VC
            </button>
          </div>
        )}

        <div className="grid">
          {/* CCTV Feed Panel */}
          <div className="panel">
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "16px" }}>
              <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                <Video color="#ef4444" size={20} />
                <h3 style={{ fontSize: "16px" }}>{activeNgo.name}</h3>
              </div>
              <span style={{ color: "#ef4444", fontSize: "12px", fontWeight: "bold" }}>● RTSP LIVE</span>
            </div>

            <div style={{ width: "100%", height: "320px", background: "#030712", borderRadius: "6px", overflow: "hidden", position: "relative" }}>
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                style={{ width: "100%", height: "100%", objectFit: "cover" }}
              />

              {/* Headcount Overlay Badge */}
              <div style={{ position: "absolute", top: "12px", left: "12px", background: "rgba(15, 23, 42, 0.85)", border: "1px solid #38bdf8", padding: "4px 10px", borderRadius: "4px", fontSize: "12px", color: "#38bdf8", display: "flex", gap: "6px", alignItems: "center" }}>
                {isAiLoading ? (
                  <span>Initializing Vision Engine...</span>
                ) : (
                  <>
                    <UserCheck size={14} /> Live AI Headcount: <b>{liveHeadcount} Person(s)</b>
                  </>
                )}
              </div>

              <div style={{ position: "absolute", bottom: "10px", left: "12px", background: "rgba(0,0,0,0.6)", padding: "4px 8px", borderRadius: "4px", fontSize: "11px", color: "#94a3b8" }}>
                CAM_01: MAIN_DORMITORY_HALL (24 FPS)
              </div>
            </div>

            <div style={{ marginTop: "16px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <button className="btn btn-red" onClick={() => setIsCalling(true)}>
                Instant Surprise VC
              </button>
              <div style={{ color: "#9ca3af", fontSize: "13px" }}>
                Reported Count: <b>{activeNgo.reported_occupancy}</b> | Risk: <b>{activeNgo.risk_score * 100}%</b>
              </div>
            </div>
          </div>

          {/* Assigned Inspections Panel */}
          <div className="panel">
            <h3 style={{ fontSize: "16px", marginBottom: "16px" }}>Randomized Duty Dispatches</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              {inspections.map((duty) => (
                <div key={duty.id} style={{ border: "1px solid #1f2937", padding: "12px", borderRadius: "6px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontWeight: "bold" }}>Inspection #{duty.id}</span>
                    <span className={`badge badge-${duty.status.toLowerCase()}`}>{duty.status}</span>
                  </div>
                  <p style={{ color: "#6b7280", fontSize: "12px", margin: "6px 0" }}>
                    Status: {duty.status === "ASSIGNED" ? "Waiting for Field Check-in" : "Verified On-Site"}
                  </p>
                  {duty.status === "ASSIGNED" && (
                    <button
                      className="btn btn-blue"
                      style={{ width: "100%", fontSize: "12px", marginTop: "4px" }}
                      onClick={() => simulateCheckin(duty.id)}
                    >
                      <Send size={12} style={{ display: "inline", marginRight: "4px" }} />
                      Simulate Mobile Field Verification
                    </button>
                  )}
                </div>
              ))}
            </div>

            {uploadResult && (
              <div style={{ marginTop: "20px", padding: "12px", background: "#064e3b", borderRadius: "6px" }}>
                <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                  <CheckCircle size={16} color="#34d399" />
                  <span style={{ fontWeight: "bold", fontSize: "13px" }}>Check-in Geo-Verified</span>
                </div>
                <p style={{ fontSize: "12px", marginTop: "4px" }}>
                  Distance: {uploadResult.distance_meters}m | Location: Locked to Center Polygon
                </p>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Surprise Video Call Modal */}
      {isCalling && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}>
          <div style={{ background: "#1e293b", padding: "28px", borderRadius: "12px", width: "450px", border: "1px solid #475569", textAlign: "center" }}>
            <div style={{ width: "70px", height: "70px", background: "#dc2626", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
              <PhoneCall size={32} color="#fff" />
            </div>
            <h3 style={{ fontSize: "18px", fontWeight: "bold" }}>Priority Surprise VC In Progress</h3>
            <p style={{ color: "#94a3b8", fontSize: "13px", marginTop: "6px" }}>
              Direct encrypted WebRTC link established with <b>Project Incharge / Warden</b>.
            </p>
            <div style={{ marginTop: "20px", padding: "12px", background: "#0f172a", borderRadius: "8px", fontSize: "12px", color: "#38bdf8" }}>
              Connecting to Asha Kiran On-Duty Tablet (+91-9876543210)...
            </div>
            <button className="btn btn-red" style={{ marginTop: "20px", width: "100%" }} onClick={() => setIsCalling(false)}>
              End Video Session
            </button>
          </div>
        </div>
      )}
    </div>
  );
}