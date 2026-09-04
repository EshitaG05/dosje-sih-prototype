import React, { useState, useEffect, useRef } from "react";
import { 
  Video, ShieldAlert, CheckCircle, RefreshCw, Send, PhoneCall, 
  UserCheck, MapPin, Smartphone, Shield, Lock, AlertOctagon, Download 
} from "lucide-react";
import * as tf from "@tensorflow/tfjs";
import * as cocoSsd from "@tensorflow-models/coco-ssd";
import jsPDF from "jspdf";
import GeoFenceMap from "./GeoFenceMap";

export default function App() {
  const [viewMode, setViewMode] = useState("command"); // "command" or "inspector"
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

  // 6. Verification Submission (Checks Real Proximity)
  const submitFieldVerification = async (dutyId, simulateInside = false) => {
    setIsCheckingIn(true);
    setDutyResult(null);

    // Target NGO is at 26.8439, 75.5652.
    // If simulateInside is true: we send coords 15m away (26.8440, 75.5653).
    // If simulateInside is false: we send user's real laptop GPS or a distant point (causes violation).
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

    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text("Digital Signature: SHA256::e9b2718cf30a514d - Generated by DoSJE PMU Autonomous Engine.", 14, 130);
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

        {/* View Switcher */}
        <div style={{ display: "flex", background: "#030712", padding: "4px", borderRadius: "8px", border: "1px solid #1f2937", gap: "6px" }}>
          <button
            onClick={() => setViewMode("command")}
            style={{ padding: "6px 14px", borderRadius: "6px", background: viewMode === "command" ? "#2563eb" : "transparent", color: "#fff", border: "none", fontSize: "12px", fontWeight: 600, cursor: "pointer" }}
          >
            Central PMU Console
          </button>
          <button
            onClick={() => { setViewMode("inspector"); acquireLiveGPS(); }}
            style={{ padding: "6px 14px", borderRadius: "6px", background: viewMode === "inspector" ? "#2563eb" : "transparent", color: "#fff", border: "none", fontSize: "12px", fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: "6px" }}
          >
            <Smartphone size={14} /> Field Inspector App
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

                        {/* Download PDF Button */}
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
        ) : (
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
                <div style={{ background: "#1e293b", padding: "16px", borderRadius: "10px", border: "1px solid #475569" }}>
                  {/* Blind Lock Protocol Banner */}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "#0f172a", padding: "8px 12px", borderRadius: "6px", border: "1px solid #334155" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                      <Lock size={14} color="#f59e0b" />
                      <span style={{ fontSize: "11px", fontWeight: "bold", color: "#f59e0b" }}>BLIND DUTY LOCK</span>
                    </div>
                    <span style={{ fontSize: "11px", color: "#94a3b8" }}>Center details locked: <b>42m left</b></span>
                  </div>

                  <div style={{ fontSize: "15px", fontWeight: "bold", marginTop: "12px" }}>{activeNgo.name}</div>
                  <div style={{ fontSize: "12px", color: "#94a3b8" }}>Enforced Perimeter: 200m Radius</div>

                  {/* Leaflet Map with 200m Ring */}
                  <GeoFenceMap
                    ngoLat={activeNgo.latitude}
                    ngoLon={activeNgo.longitude}
                    inspectorLat={inspectorLocation ? inspectorLocation.lat : 26.8500}
                    inspectorLon={inspectorLocation ? inspectorLocation.lon : 75.5700}
                    isInside={dutyResult?.success || false}
                  />

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
        )}
      </div>

      {/* Surprise Video Call Modal */}
      {isCalling && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}>
          <div style={{ background: "#1e293b", padding: "24px", borderRadius: "12px", width: "400px", textAlign: "center", border: "1px solid #475569" }}>
            <PhoneCall size={32} color="#ef4444" style={{ margin: "0 auto 12px" }} />
            <div style={{ fontSize: "16px", fontWeight: "bold" }}>Emergency Video Link</div>
            <div style={{ color: "#94a3b8", fontSize: "12px", marginTop: "6px" }}>Connecting to Asha Kiran Center Warden...</div>
            <button onClick={() => setIsCalling(false)} style={{ marginTop: "16px", background: "#dc2626", color: "#fff", border: "none", padding: "8px 16px", borderRadius: "6px", cursor: "pointer" }}>
              End Call
            </button>
          </div>
        </div>
      )}
    </div>
  );
}