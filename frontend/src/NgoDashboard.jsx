import React, { useState } from "react";
import { Building2, Users, Send, CheckCircle2, PhoneCall, ShieldAlert } from "lucide-react";

export default function NgoDashboard({ activeNgo, onReportUpdated }) {
  const [occupancy, setOccupancy] = useState(activeNgo?.reported_occupancy || 45);
  const [staffCount, setStaffCount] = useState(4);
  const [remarks, setRemarks] = useState("Daily morning roll count verified.");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMsg, setSuccessMsg] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    setSuccessMsg("");

    try {
      const res = await fetch(`http://127.0.0.1:8000/ngos/${activeNgo?.id || 1}/submit-report`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reported_occupancy: parseInt(occupancy, 10),
          staff_on_duty: parseInt(staffCount, 10),
          remarks: remarks,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Submission failed");

      setSuccessMsg(`✓ Grant roll submitted: ${occupancy} registered beneficiaries logged.`);
      if (onReportUpdated) onReportUpdated();
    } catch (err) {
      alert("Submission error: " + err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div style={{ display: "flex", width: "100%", justifyContent: "center", padding: "30px 20px", background: "#030712", overflowY: "auto" }}>
      <div style={{ width: "650px", display: "flex", flexDirection: "column", gap: "20px" }}>
        
        {/* NGO Header Card */}
        <div style={{ background: "#111827", border: "1px solid #1f2937", borderRadius: "12px", padding: "20px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              <div style={{ background: "#1e293b", padding: "10px", borderRadius: "8px" }}>
                <Building2 size={24} color="#38bdf8" />
              </div>
              <div>
                <div style={{ fontSize: "16px", fontWeight: "bold" }}>{activeNgo?.name || "Asha Kiran Rehabilitation Center"}</div>
                <div style={{ fontSize: "12px", color: "#94a3b8" }}>DoSJE Grant Code: GIA-RAJ-2026-088</div>
              </div>
            </div>
            <span style={{ fontSize: "11px", color: "#22c55e", background: "rgba(34,197,94,0.1)", padding: "4px 8px", borderRadius: "4px", fontWeight: "bold" }}>
              INSTITUTE VERIFIED
            </span>
          </div>

          {/* Quick Metrics */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "12px", marginTop: "18px" }}>
            <div style={{ background: "#0a0f1d", padding: "12px", borderRadius: "8px", border: "1px solid #1f2937" }}>
              <div style={{ fontSize: "11px", color: "#94a3b8" }}>Current Declared Roll</div>
              <div style={{ fontSize: "18px", fontWeight: "bold", color: "#38bdf8", marginTop: "4px" }}>
                {activeNgo?.reported_occupancy || 45}
              </div>
            </div>
            <div style={{ background: "#0a0f1d", padding: "12px", borderRadius: "8px", border: "1px solid #1f2937" }}>
              <div style={{ fontSize: "11px", color: "#94a3b8" }}>Facility Risk Level</div>
              <div style={{ fontSize: "18px", fontWeight: "bold", color: activeNgo?.risk_score > 0.5 ? "#ef4444" : "#4ade80", marginTop: "4px" }}>
                {activeNgo?.risk_score ? `${(activeNgo.risk_score * 100).toFixed(0)}%` : "Moderate"}
              </div>
            </div>
            <div style={{ background: "#0a0f1d", padding: "12px", borderRadius: "8px", border: "1px solid #1f2937" }}>
              <div style={{ fontSize: "11px", color: "#94a3b8" }}>CCTV Surveillance</div>
              <div style={{ fontSize: "18px", fontWeight: "bold", color: "#22c55e", marginTop: "4px" }}>Active</div>
            </div>
          </div>
        </div>

        {/* Self-Reporting Form */}
        <div style={{ background: "#111827", border: "1px solid #1f2937", borderRadius: "12px", padding: "22px" }}>
          <div style={{ fontSize: "15px", fontWeight: "bold", marginBottom: "4px" }}>Submit Statutory Daily/Weekly Roll</div>
          <div style={{ fontSize: "12px", color: "#94a3b8", marginBottom: "18px" }}>
            This declared figure directly feeds the DoSJE Autonomous PMU Assurance Engine for live visual audit calibration.
          </div>

          <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            <div>
              <label style={{ display: "block", fontSize: "12px", color: "#cbd5e1", marginBottom: "6px" }}>
                Active Present Beneficiaries (Residents)
              </label>
              <input
                type="number"
                min="1"
                max="300"
                value={occupancy}
                onChange={(e) => setOccupancy(e.target.value)}
                required
                style={{ width: "100%", padding: "10px", borderRadius: "6px", background: "#0a0f1d", border: "1px solid #374151", color: "#fff", fontSize: "14px" }}
              />
            </div>

            <div>
              <label style={{ display: "block", fontSize: "12px", color: "#cbd5e1", marginBottom: "6px" }}>
                Supervisory Staff / Wardens on Duty
              </label>
              <input
                type="number"
                min="1"
                max="50"
                value={staffCount}
                onChange={(e) => setStaffCount(e.target.value)}
                required
                style={{ width: "100%", padding: "10px", borderRadius: "6px", background: "#0a0f1d", border: "1px solid #374151", color: "#fff", fontSize: "14px" }}
              />
            </div>

            <div>
              <label style={{ display: "block", fontSize: "12px", color: "#cbd5e1", marginBottom: "6px" }}>
                Remarks / Daily Verification Note
              </label>
              <textarea
                rows="3"
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
                style={{ width: "100%", padding: "10px", borderRadius: "6px", background: "#0a0f1d", border: "1px solid #374151", color: "#fff", fontSize: "13px", resize: "none" }}
              />
            </div>

            {successMsg && (
              <div style={{ display: "flex", alignItems: "center", gap: "8px", background: "rgba(34, 197, 94, 0.15)", border: "1px solid #16a34a", padding: "10px 14px", borderRadius: "6px", color: "#4ade80", fontSize: "12px" }}>
                <CheckCircle2 size={16} />
                <span>{successMsg}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={isSubmitting}
              style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", background: "#2563eb", color: "#fff", border: "none", padding: "12px", borderRadius: "8px", fontWeight: "bold", fontSize: "13px", cursor: "pointer", marginTop: "6px" }}
            >
              <Send size={15} />
              {isSubmitting ? "Transmitting..." : "Transmit Verified Roll to DoSJE"}
            </button>
          </form>
        </div>

      </div>
    </div>
  );
}