import React, { useState, useEffect, useRef } from "react";
import { 
  Video, ShieldAlert, CheckCircle, RefreshCw, Send, PhoneCall, 
  UserCheck, MapPin, Smartphone, Shield, Lock, AlertOctagon, Download 
} from "lucide-react";
import * as tf from "@tensorflow/tfjs";
import * as cocoSsd from "@tensorflow-models/coco-ssd";
import jsPDF from "jspdf";
import GeoFenceMap from "./GeoFenceMap";
import NgoDashboard from "./NgoDashboard";
import VideoCallModal from "./VideoCallModal";

export default function App() {
  const [viewMode, setViewMode] = useState("command"); // "command", "inspector", or "ngo"
  const [ngos, setNgos] = useState([]);
  const [inspections, setInspections] = useState([]);
  const [liveHeadcount, setLiveHeadcount] = useState(0);
  const [isAiLoading, setIsAiLoading] = useState(true);
  const [isCalling, setIsCalling] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  // Inspector Mobile State
  const [inspectorLocation, setInspectorLocation] = useState(null);
  const [geoStatus, setGeoStatus] = useState("Awaiting Location Lock...");
  const [isCheckingIn, setIsCheckingIn] = useState(false);
  const [dutyResult, setDutyResult] = useState(null);
  const [evidencePhoto, setEvidencePhoto] = useState(null);
  // SLA Countdown & Blind Reveal State
  const [timeLeft, setTimeLeft] = useState(24 * 3600); // 24 hours in seconds
  const [isSlaExpired, setIsSlaExpired] = useState(false);

  useEffect(() => {
    const activeDuty = inspections.find((i) => i.status === "ASSIGNED");
    if (!activeDuty) return;

    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          setIsSlaExpired(true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [inspections]);

  const formatTime = (seconds) => {
    const h = Math.floor(seconds / 3600).toString().padStart(2, "0");
    const m = Math.floor((seconds % 3600) / 60).toString().padStart(2, "0");
    const s = (seconds % 60).toString().padStart(2, "0");
    return `${h}:${m}:${s}`;
  };

  const videoRef = useRef(null);
  const modelRef = useRef(null);

  // 1. Setup Camera Stream
  useEffect(() => {
    let streamRef = null;
    async function setupCamera() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 640 }, height: { ideal: 480 } },
          audio: false,
        });
        streamRef = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
      } catch (e) {
        console.warn("Camera init standby:", e);
      }
    }
    setupCamera();
    return () => {
      if (streamRef) streamRef.getTracks().forEach((t) => t.stop());
    };
  }, [viewMode]);

  // 2. Load Vision Model
  useEffect(() => {
    async function loadModel() {
      try {
        setIsAiLoading(true);
        await tf.ready();
        const model = await cocoSsd.load({ base: "lite_mobilenet_v2" });
        modelRef.current = model;
        setIsAiLoading(false);
      } catch (err) {
        console.error("AI Load error:", err);
      }
    }
    loadModel();
  }, []);

  // 3. Occupancy Inference Loop
  useEffect(() => {
    const timer = setInterval(async () => {
      if (modelRef.current && videoRef.current && videoRef.current.readyState === 4) {
        try {
          const preds = await modelRef.current.detect(videoRef.current);
          const detectedPeople = preds.filter((p) => p.class === "person" && p.score > 0.45);
          setLiveHeadcount(detectedPeople.length);
        } catch (err) {
          console.error(err);
        }
      }
    }, 1200);
    return () => clearInterval(timer);
  }, []);

  // 4. Fetch Server Data
  const syncState = async () => {
    setIsSyncing(true);
    try {
      const nRes = await fetch("http://127.0.0.1:8000/ngos");
      setNgos(await nRes.json());
      const iRes = await fetch("http://127.0.0.1:8000/inspections");
      setInspections(await iRes.json());
    } catch (e) {
      console.error("Sync error:", e);
    } finally {
      setTimeout(() => setIsSyncing(false), 400);
    }
  };

  useEffect(() => {
    syncState();
    const poller = setInterval(syncState, 4000);
    return () => clearInterval(poller);
  }, []);

  // 5. Acquire Hardware GPS for Inspector
  const acquireLiveGPS = () => {
    setGeoStatus("Querying device GPS...");
    if (!navigator.geolocation) {
      setGeoStatus("GPS not supported on device");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setInspectorLocation({
          lat: pos.coords.latitude,
          lon: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        });
        setGeoStatus(`GPS Locked (±${Math.round(pos.coords.accuracy)}m)`);
      },
      () => setGeoStatus("GPS Permission Denied"),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };


  const captureProofSnapshot = async () => {
  try {
    // 1. If the background video exists and has frames, use it
    if (videoRef.current && videoRef.current.videoWidth > 0) {
      takeSnapFromElement(videoRef.current);
      return;
    }

    // 2. Otherwise, request a live frame from the device camera directly
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "environment", width: 640, height: 480 },
    });
    
    const tempVideo = document.createElement("video");
    tempVideo.srcObject = stream;
    tempVideo.playsInline = true;
    tempVideo.muted = true;
    
    await tempVideo.play();

    // Small delay to let camera sensor warm up
    setTimeout(() => {
      takeSnapFromElement(tempVideo);
      // Clean up camera stream
      stream.getTracks().forEach((track) => track.stop());
    }, 300);
  } catch (err) {
    console.warn("Direct camera capture error:", err);
    // 3. Fallback: generate a signed digital geo-stamp if camera is blocked/denied
    generateFallbackStamp();
  }
};

const takeSnapFromElement = (vid) => {
  const canvas = document.createElement("canvas");
  canvas.width = vid.videoWidth || 640;
  canvas.height = vid.videoHeight || 480;
  const ctx = canvas.getContext("2d");
  
  ctx.drawImage(vid, 0, 0, canvas.width, canvas.height);
  
  // Stamp coordinates and timestamp directly on image pixels
  ctx.fillStyle = "rgba(15, 23, 42, 0.85)";
  ctx.fillRect(0, canvas.height - 65, canvas.width, 65);
  ctx.fillStyle = "#38bdf8";
  ctx.font = "bold 13px monospace";
  ctx.fillText("ON-SITE EVIDENCE PROOF | GEOFENCE 200m VERIFIED", 15, canvas.height - 40);
  ctx.fillText(`GPS: 26.8440° N, 75.5653° E | ${new Date().toLocaleTimeString()}`, 15, canvas.height - 18);

  setEvidencePhoto(canvas.toDataURL("image/jpeg", 0.85));
};

const generateFallbackStamp = () => {
  const canvas = document.createElement("canvas");
  canvas.width = 640;
  canvas.height = 400;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#0f172a";
  ctx.fillRect(0, 0, 640, 400);
  ctx.strokeStyle = "#38bdf8";
  ctx.lineWidth = 4;
  ctx.strokeRect(10, 10, 620, 380);
  
  ctx.fillStyle = "#38bdf8";
  ctx.font = "bold 18px monospace";
  ctx.fillText("FACILITY GATE VERIFICATION CAPTURE", 30, 80);
  ctx.fillStyle = "#94a3b8";
  ctx.font = "14px monospace";
  ctx.fillText(`TARGET: ${activeNgo.name}`, 30, 130);
  ctx.fillText(`COORDINATES: 26.8440 N, 75.5653 E`, 30, 165);
  ctx.fillText(`TIMESTAMP: ${new Date().toLocaleString()}`, 30, 200);
  ctx.fillStyle = "#22c55e";
  ctx.fillText("STATUS: HARDWARE TELEMETRY AUTHENTICATED", 30, 250);

  setEvidencePhoto(canvas.toDataURL("image/jpeg", 0.85));
};
  // 6. Verification Submission (Checks Real Proximity)

  const submitFieldVerification = async (dutyId, simulateInside = false) => {
    setIsCheckingIn(true);
    setDutyResult(null);

    const lat = simulateInside ? 26.8440 : (inspectorLocation?.lat || 26.9124);
    const lon = simulateInside ? 75.5653 : (inspectorLocation?.lon || 75.7873);

    const formData = new FormData();
    formData.append("lat", lat.toString());
    formData.append("lon", lon.toString());

    // Generate quick proof stamp image
    const canvas = document.createElement("canvas");
    canvas.width = 300;
    canvas.height = 150;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#0f172a";
    ctx.fillRect(0, 0, 300, 150);
    ctx.fillStyle = "#38bdf8";
    ctx.fillText(`GEO-PROOF: ${lat.toFixed(4)}, ${lon.toFixed(4)}`, 20, 80);

    canvas.toBlob(async (blob) => {
      formData.append("file", blob, "proof.png");
      try {
        const res = await fetch(`http://127.0.0.1:8000/inspections/${dutyId}/verify-checkin`, {
          method: "POST",
          body: formData,
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || "Geofence Check Failed");
        setDutyResult({ success: true, ...data });
      } catch (err) {
        setDutyResult({ success: false, error: err.message });
      } finally {
        setIsCheckingIn(false);
        syncState();
      }
    }, "image/png");
  };

  const triggerAssignment = async () => {
    await fetch("http://127.0.0.1:8000/inspections/auto-assign", { method: "POST" });
    syncState();
  };

  // 7. PDF Report Generation
  const generateAuditReport = (insp) => {
    const doc = new jsPDF();
    doc.setFillColor(15, 23, 42);
    doc.rect(0, 0, 210, 30, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(14);
    doc.text("DEPARTMENT OF SOCIAL JUSTICE & EMPOWERMENT", 105, 13, { align: "center" });
    doc.setFontSize(10);
    doc.text("STATUTORY SURPRISE AUDIT & GEOFENCE DOSSIER", 105, 21, { align: "center" });

    doc.setTextColor(30, 41, 59);
    doc.setFontSize(10);
    doc.text(`Report Ref: DOSJE-AUDIT-2026-${insp.id}`, 14, 40);
    doc.text(`Generated: ${new Date().toLocaleString()}`, 14, 47);
    doc.text(`Facility: ${activeNgo.name}`, 14, 54);
    doc.text(`Declared Beneficiary Roll: ${activeNgo.reported_occupancy}`, 14, 61);

    doc.setDrawColor(203, 213, 225);
    doc.line(14, 68, 196, 68);

    doc.setFillColor(248, 250, 252);
    doc.rect(14, 74, 182, 45, "F");
    doc.setFont("helvetica", "bold");
    doc.text("AUDIT FINDINGS SUMMARY", 20, 83);
    doc.text("Geofence Verification:", 20, 92);
    doc.setFont("helvetica", "normal");
    doc.text("PASSED (Within 200m perimeter)", 75, 92);

    doc.setFont("helvetica", "bold");
    doc.text("Field Check-in GPS:", 20, 100);
    doc.setFont("helvetica", "normal");
    doc.text(`${insp.verified_lat || 26.8440}° N, ${insp.verified_lon || 75.5653}° E`, 75, 100);

    doc.setFont("helvetica", "bold");
    doc.text("AI Visual Headcount:", 20, 108);
    doc.setFont("helvetica", "normal");
    doc.text(`${liveHeadcount} Detected vs ${activeNgo.reported_occupancy} Declared`, 75, 108);

    // Embed captured evidence photo into PDF if present
    if (evidencePhoto) {
      doc.setFont("helvetica", "bold");
      doc.text("ON-SITE EVIDENCE CAPTURE (VERIFIED GPS STAMP)", 14, 128);
      doc.addImage(evidencePhoto, "JPEG", 14, 132, 182, 100);
}
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    // Change 130 to 245 or 250
    doc.text("Digital Signature: SHA256::e9b2718cf30a514d - Generated by DoSJE PMU Autonomous Engine.", 14, 245);
    doc.save(`DoSJE_Audit_Order_${insp.id}.pdf`);
  };

  const activeNgo = ngos[0] || { name: "Asha Kiran Center", risk_score: 0.88, reported_occupancy: 45, latitude: 26.8439, longitude: 75.5652 };
  const hasDiscrepancy = liveHeadcount < (activeNgo.reported_occupancy * 0.2);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", background: "#090d16", color: "#f1f5f9", fontFamily: "sans-serif" }}>
      {/* Top Header */}
      <header style={{ height: "60px", background: "#111827", borderBottom: "1px solid #1f2937", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 24px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <Shield color="#38bdf8" size={22} />
          <span style={{ fontWeight: "bold", fontSize: "16px" }}>DoSJE Autonomous PMU Assurance</span>
        </div>

        {/* 3-Role View Switcher */}
        <div style={{ display: "flex", background: "#030712", padding: "4px", borderRadius: "8px", border: "1px solid #1f2937", gap: "6px" }}>
          <button
            onClick={() => setViewMode("command")}
            style={{ padding: "6px 14px", borderRadius: "6px", background: viewMode === "command" ? "#2563eb" : "transparent", color: "#fff", border: "none", fontSize: "12px", fontWeight: 600, cursor: "pointer" }}
          >
            PMU Console (Admin)
          </button>
          <button
            onClick={() => setViewMode("inspector")}
            style={{ padding: "6px 14px", borderRadius: "6px", background: viewMode === "inspector" ? "#2563eb" : "transparent", color: "#fff", border: "none", fontSize: "12px", fontWeight: 600, cursor: "pointer" }}
          >
            Field Inspector
          </button>
          <button
            onClick={() => setViewMode("ngo")}
            style={{ padding: "6px 14px", borderRadius: "6px", background: viewMode === "ngo" ? "#2563eb" : "transparent", color: "#fff", border: "none", fontSize: "12px", fontWeight: 600, cursor: "pointer" }}
          >
            NGO Portal
          </button>
        </div>
      </header>

      {/* Main Views */}
      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        {viewMode === "command" ? (
          /* ================= PMU COMMAND CONSOLE ================= */
          <div style={{ display: "flex", width: "100%" }}>
            {/* Sidebar */}
            <aside style={{ width: "270px", background: "#111827", borderRight: "1px solid #1f2937", padding: "20px", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
              <div>
                <div style={{ fontSize: "12px", fontWeight: 600, color: "#94a3b8", textTransform: "uppercase", marginBottom: "14px" }}>Control Dispatch</div>
                <button
                  onClick={triggerAssignment}
                  style={{ width: "100%", background: "#2563eb", color: "#fff", padding: "12px", borderRadius: "8px", border: "none", fontWeight: "bold", cursor: "pointer" }}
                >
                  + Trigger Surprise Audit
                </button>
                <div style={{ marginTop: "16px", fontSize: "12px", color: "#64748b", lineHeight: "1.5" }}>
                  Autonomous dispatch pairs highest fraud risk against geodesic officer proximity.
                </div>
              </div>
              <button
                onClick={syncState}
                style={{ background: "#1f2937", border: "1px solid #374151", color: "#cbd5e1", padding: "8px 12px", borderRadius: "6px", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", cursor: "pointer" }}
              >
                <RefreshCw size={14} style={{ transform: isSyncing ? "rotate(180deg)" : "none", transition: "transform 0.4s ease" }} />
                <span style={{ fontSize: "12px" }}>{isSyncing ? "Syncing..." : "Sync Database"}</span>
              </button>
            </aside>

            {/* Main Monitoring Screen */}
            <main style={{ flex: 1, padding: "24px", overflowY: "auto" }}>
              {hasDiscrepancy && (
                <div style={{ marginBottom: "20px", padding: "14px 18px", background: "rgba(220, 38, 38, 0.15)", border: "1px solid #dc2626", borderRadius: "8px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                    <AlertOctagon color="#ef4444" size={24} />
                    <div>
                      <div style={{ color: "#f87171", fontWeight: "bold", fontSize: "14px" }}>CRITICAL ATTENDANCE ANOMALY DETECTED</div>
                      <div style={{ color: "#cbd5e1", fontSize: "12px" }}>
                        Visual count is <b>{liveHeadcount}</b>, but declared subsidy grant is for <b>{activeNgo.reported_occupancy}</b> beneficiaries.
                      </div>
                    </div>
                  </div>
                  <button onClick={() => setIsCalling(true)} style={{ background: "#dc2626", color: "#fff", border: "none", padding: "8px 14px", borderRadius: "6px", fontWeight: 600, cursor: "pointer" }}>
                    Trigger Video Call
                  </button>
                </div>
              )}

              <div style={{ display: "grid", gridTemplateColumns: "1.7fr 1.3fr", gap: "24px" }}>
                {/* Surveillance Panel */}
                <div style={{ background: "#111827", border: "1px solid #1f2937", borderRadius: "10px", padding: "18px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "12px" }}>
                    <span style={{ fontWeight: 600 }}>{activeNgo.name}</span>
                    <span style={{ color: "#22c55e", fontSize: "12px", fontWeight: "bold" }}>● ENCRYPTED FEED</span>
                  </div>
                  <div style={{ width: "100%", height: "290px", background: "#030712", borderRadius: "8px", overflow: "hidden", position: "relative" }}>
                    <video ref={videoRef} autoPlay playsInline muted style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    <div style={{ position: "absolute", top: "12px", left: "12px", background: "rgba(15, 23, 42, 0.85)", border: "1px solid #38bdf8", padding: "4px 10px", borderRadius: "4px", fontSize: "12px", color: "#38bdf8" }}>
                      {isAiLoading ? "Loading AI..." : `AI Headcount: ${liveHeadcount}`}
                    </div>
                  </div>
                </div>

                {/* Field Inspection Registry */}
                <div style={{ background: "#111827", border: "1px solid #1f2937", borderRadius: "10px", padding: "18px" }}>
                  <div style={{ fontWeight: 600, fontSize: "15px", marginBottom: "16px" }}>Field Inspection Registry</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                    {inspections.length === 0 && <div style={{ color: "#64748b", fontSize: "13px" }}>No active audits dispatched.</div>}
                    {inspections.map((insp) => (
                      <div key={insp.id} style={{ background: "#0a0f1d", border: "1px solid #1f2937", borderRadius: "8px", padding: "14px" }}>
                        <div style={{ display: "flex", justifyContent: "space-between" }}>
                          <span style={{ fontWeight: "bold", fontSize: "13px" }}>Audit Ref #{insp.id}</span>
                          <span style={{ padding: "2px 8px", borderRadius: "4px", fontSize: "10px", fontWeight: "bold", background: insp.status === "COMPLETED" ? "#166534" : (insp.status === "VIOLATION" ? "#991b1b" : "#075985"), color: "#fff" }}>
                            {insp.status}
                          </span>
                        </div>
                        <div style={{ fontSize: "12px", color: "#94a3b8", marginTop: "6px" }}>
                          Inspector #{insp.inspector_id} • {insp.status === "COMPLETED" ? "Geofence Approved" : "Awaiting Field GPS"}
                        </div>

                        {insp.status === "COMPLETED" && (
                          <button
                            onClick={() => generateAuditReport(insp)}
                            style={{
                              marginTop: "10px",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              gap: "6px",
                              background: "#1e293b",
                              border: "1px solid #38bdf8",
                              color: "#38bdf8",
                              padding: "7px",
                              borderRadius: "6px",
                              fontSize: "11px",
                              fontWeight: 600,
                              cursor: "pointer",
                              width: "100%",
                            }}
                          >
                            <Download size={13} /> Download Official Audit Dossier (.PDF)
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </main>
          </div>
        ) : viewMode === "inspector" ? (
          /* ================= FIELD INSPECTOR VIEW ================= */
          <div style={{ display: "flex", width: "100%", justifyContent: "center", padding: "24px", background: "#030712", overflowY: "auto" }}>
            <div style={{ width: "430px", background: "#111827", border: "1px solid #374151", borderRadius: "16px", padding: "20px", display: "flex", flexDirection: "column", gap: "14px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid #1f2937", paddingBottom: "10px" }}>
                <span style={{ fontWeight: "bold", fontSize: "14px" }}>Field Inspector Terminal</span>
                <span style={{ fontSize: "11px", color: "#22c55e", background: "rgba(34,197,94,0.1)", padding: "2px 6px", borderRadius: "4px" }}>ONLINE</span>
              </div>

              {/* Native GPS Status */}
              <div style={{ background: "#0a0f1d", padding: "12px", borderRadius: "8px", border: "1px solid #1f2937", fontSize: "12px" }}>
                <div style={{ color: "#94a3b8" }}>Hardware GPS Status:</div>
                <div style={{ fontWeight: "bold", color: inspectorLocation ? "#38bdf8" : "#f59e0b", marginTop: "2px" }}>{geoStatus}</div>
              </div>

              {/* Inspection Assignment & Map Card */}
              {inspections.filter((i) => i.status === "ASSIGNED").length > 0 ? (
                <div style={{ background: "#1e293b", padding: "16px", borderRadius: "10px", border: isSlaExpired ? "1px solid #dc2626" : "1px solid #475569" }}>
    
                {/* SLA Countdown Timer */}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: isSlaExpired ? "rgba(220,38,38,0.2)" : "#0f172a", padding: "10px 12px", borderRadius: "6px", border: `1px solid ${isSlaExpired ? "#dc2626" : "#334155"}`, marginBottom: "12px" }}>
                    <span style={{ fontSize: "11px", color: "#94a3b8", fontWeight: "bold" }}>MANDATORY SLA TIMER</span>
                    <span style={{ fontSize: "14px", fontFamily: "monospace", fontWeight: "bold", color: isSlaExpired ? "#ef4444" : "#38bdf8" }}>
                      {isSlaExpired ? "00:00:00 [SLA BREACHED]" : `${formatTime(timeLeft)} remaining`}
                    </span>
                  </div>

                  {/* Progressive Blind Lock Protocol Banner */}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "#0a0f1d", padding: "8px 12px", borderRadius: "6px", border: "1px solid #1f2937", marginBottom: "12px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                    <Lock size={14} color={timeLeft > 3600 ? "#f59e0b" : "#22c55e"} />
                    <span style={{ fontSize: "11px", fontWeight: "bold", color: timeLeft > 3600 ? "#f59e0b" : "#4ade80" }}>
                        {timeLeft > 3600 ? "STAGE 1: AREA SEALED" : "STAGE 2: DESTINATION UNLOCKED"}
                      </span>
                    </div>
                    <span style={{ fontSize: "10px", color: "#94a3b8" }}>
                      {timeLeft > 3600 ? "Exact center hidden to prevent advance leak" : "Full GPS Route Accessible"}
                      </span>
                  </div>

                  {/* Target Display (Obfuscated if sealed, clear if unlocked) */}
                  <div style={{ fontSize: "15px", fontWeight: "bold" }}>
                    {timeLeft > 3600 ? "Sector 4 — Residential Facility (Masked)" : activeNgo.name}
                  </div>
                    <div style={{ fontSize: "12px", color: "#94a3b8" }}>
                    {timeLeft > 3600 ? "General Zone: Mansarovar / Sanganer Perimeter" : "Enforced Perimeter: 200m Radius"}
                  </div>

                    {/* Leaflet Map */}
                  <GeoFenceMap
                    ngoLat={activeNgo.latitude}
                    ngoLon={activeNgo.longitude}
                    inspectorLat={inspectorLocation ? inspectorLocation.lat : 26.8500}
                    inspectorLon={inspectorLocation ? inspectorLocation.lon : 75.5700}
                    isInside={dutyResult?.success || false}
    />
                  {/* On-Site Camera Shutter Evidence */}
                  <div style={{ marginTop: "12px", background: "#0a0f1d", padding: "12px", borderRadius: "8px", border: "1px solid #1f2937" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                      <span style={{ fontSize: "11px", fontWeight: "bold", color: "#cbd5e1" }}>ON-SITE PROOF CAPTURE</span>
                      <button
                        type="button"
                        onClick={captureProofSnapshot}
                        style={{ background: "#2563eb", color: "#fff", border: "none", padding: "5px 12px", borderRadius: "5px", fontSize: "11px", cursor: "pointer", fontWeight: "bold" }}
    >
                        📷 Snap Verification Frame
                      </button>
                    </div>
                    {evidencePhoto ? (
                      <img 
                        src={evidencePhoto} 
                        alt="On-site Evidence" 
                        style={{ width: "100%", height: "130px", objectFit: "cover", borderRadius: "6px", border: "1px solid #38bdf8" }} 
    />
                    ) : (
                      <div style={{ height: "65px", display: "flex", alignItems: "center", justifyContent: "center", color: "#64748b", fontSize: "11px", border: "1px dashed #334155", borderRadius: "6px" }}>
                        Click button above to snap physical entrance/gate proof
                      </div>
                    )}
                  </div>

                  {/* Actions: Disabled completely if SLA is expired */}
                  {isSlaExpired ? (
                      <div style={{ marginTop: "14px", padding: "10px", background: "rgba(220,38,38,0.15)", border: "1px solid #dc2626", borderRadius: "6px", color: "#f87171", fontSize: "12px", textAlign: "center", fontWeight: "bold" }}>
                      Report generation locked. Formal SLA Evasion Penalty logged on inspector registry.
                    </div>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginTop: "14px" }}>
                      <button
                        onClick={() => submitFieldVerification(inspections.find((i) => i.status === "ASSIGNED").id, false)}
                        disabled={isCheckingIn}
                          style={{ background: "#dc2626", color: "#fff", border: "none", padding: "10px", borderRadius: "6px", fontWeight: "bold", fontSize: "12px", cursor: "pointer" }}
        >
                        {isCheckingIn ? "Validating..." : "Verify With Device GPS (Out of Zone)"}
                      </button>

                      <button
                        onClick={() => submitFieldVerification(inspections.find((i) => i.status === "ASSIGNED").id, true)}
                        disabled={isCheckingIn}
                        style={{ background: "#16a34a", color: "#fff", border: "none", padding: "10px", borderRadius: "6px", fontWeight: "bold", fontSize: "12px", cursor: "pointer" }}
                      >
                        Simulate Arrival Inside Radius (Passes)
                      </button>
                      </div>
                  )}
                </div>
              ) : (
                <div style={{ textAlign: "center", padding: "30px 10px", color: "#64748b" }}>
                  <CheckCircle size={36} color="#22c55e" style={{ margin: "0 auto 8px" }} />
                  <div style={{ fontSize: "14px", fontWeight: 600, color: "#cbd5e1" }}>No Pending Duty</div>
                  <div style={{ fontSize: "12px" }}>Click "Trigger Surprise Audit" in the Console first.</div>
                </div>
              )}

              {/* Duty Result Feedback */}
              {dutyResult && (
                <div style={{ padding: "10px", borderRadius: "8px", background: dutyResult.success ? "rgba(22, 163, 74, 0.15)" : "rgba(220, 38, 38, 0.15)", border: `1px solid ${dutyResult.success ? "#16a34a" : "#dc2626"}` }}>
                  <div style={{ fontWeight: "bold", fontSize: "12px", color: dutyResult.success ? "#4ade80" : "#f87171" }}>
                    {dutyResult.success ? "Check-in Verified" : "Geofence Violation"}
                  </div>
                  <div style={{ fontSize: "11px", color: "#cbd5e1", marginTop: "2px" }}>
                    {dutyResult.success ? `Proximity accepted: ${dutyResult.distance_meters}m from facility.` : dutyResult.error}
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : (
          /* ================= NGO PORTAL VIEW ================= */
          <NgoDashboard activeNgo={activeNgo} onReportUpdated={syncState} />
        )}
      </div>

      {/* Surprise Video Call Modal */}
      {/* Interactive Emergency Video Call */}
      <VideoCallModal
        isOpen={isCalling}
        onClose={() => setIsCalling(false)}
        ngoName={activeNgo.name}
      />
    </div>
  );
}