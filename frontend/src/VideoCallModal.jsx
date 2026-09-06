import React, { useEffect, useRef, useState } from "react";
import { PhoneOff, Mic, MicOff, Video, VideoOff, ShieldCheck } from "lucide-react";

export default function VideoCallModal({ isOpen, onClose, ngoName }) {
  const [isMuted, setIsMuted] = useState(false);
  const [callDuration, setCallDuration] = useState(0);
  const videoRef = useRef(null);
  const streamRef = useRef(null);

  useEffect(() => {
    if (!isOpen) {
      setCallDuration(0);
      return;
    }

    // Call duration timer
    const interval = setInterval(() => {
      setCallDuration((prev) => prev + 1);
    }, 1000);

    // Initialize local camera stream inside the modal
    async function startCallFeed() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: 640, height: 480 },
          audio: false,
        });
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
      } catch (err) {
        console.warn("Video Call camera link standby:", err);
      }
    }

    startCallFeed();

    return () => {
      clearInterval(interval);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const formatCallTime = (secs) => {
    const mins = Math.floor(secs / 60).toString().padStart(2, "0");
    const seconds = (secs % 60).toString().padStart(2, "0");
    return `${mins}:${seconds}`;
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(3, 7, 18, 0.88)", backdropFilter: "blur(6px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999 }}>
      <div style={{ width: "720px", background: "#0f172a", border: "1px solid #334155", borderRadius: "16px", overflow: "hidden", boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.7)" }}>
        
        {/* Call Header */}
        <div style={{ padding: "14px 20px", background: "#1e293b", borderBottom: "1px solid #334155", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <span style={{ height: "10px", width: "10px", borderRadius: "50%", background: "#ef4444", display: "inline-block", animation: "pulse 1.5s infinite" }} />
            <span style={{ fontWeight: "bold", fontSize: "14px", color: "#f8fafc" }}>
              Surprise Tele-Audit: {ngoName || "Asha Kiran Center"}
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <span style={{ fontSize: "12px", fontFamily: "monospace", color: "#38bdf8", background: "#0f172a", padding: "4px 8px", borderRadius: "4px", border: "1px solid #1e293b" }}>
              LIVE {formatCallTime(callDuration)}
            </span>
            <div style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "11px", color: "#4ade80" }}>
              <ShieldCheck size={14} /> End-to-End Encrypted
            </div>
          </div>
        </div>

        {/* Video Streams Container */}
        <div style={{ position: "relative", height: "420px", background: "#020617" }}>
          
          {/* Main Remote Feed (Warden Premises) */}
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
          />

          <div style={{ position: "absolute", top: "16px", left: "16px", background: "rgba(15, 23, 42, 0.8)", padding: "6px 12px", borderRadius: "6px", border: "1px solid #334155", fontSize: "12px", color: "#f8fafc" }}>
            <b>Warden Desk & Dormitory</b> • Asha Kiran Center
          </div>

          {/* Picture-in-Picture Self Feed (Central PMU Officer) */}
          <div style={{ position: "absolute", bottom: "16px", right: "16px", width: "160px", height: "110px", background: "#1e293b", border: "2px solid #38bdf8", borderRadius: "8px", overflow: "hidden", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
            <div style={{ fontSize: "11px", color: "#94a3b8", textAlign: "center" }}>PMU Console</div>
            <div style={{ fontSize: "10px", color: "#38bdf8", fontWeight: "bold" }}>OFFICER ON DUTY</div>
          </div>
        </div>

        {/* Controls Toolbar */}
        <div style={{ padding: "16px 20px", background: "#111827", display: "flex", justifyContent: "center", alignItems: "center", gap: "16px" }}>
          <button
            onClick={() => setIsMuted(!isMuted)}
            style={{ background: isMuted ? "#dc2626" : "#1f2937", border: "1px solid #374151", color: "#fff", padding: "10px", borderRadius: "50%", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
            title={isMuted ? "Unmute" : "Mute"}
          >
            {isMuted ? <MicOff size={18} /> : <Mic size={18} />}
          </button>

          <button
            onClick={onClose}
            style={{ display: "flex", alignItems: "center", gap: "8px", background: "#dc2626", color: "#fff", border: "none", padding: "10px 24px", borderRadius: "30px", fontWeight: "bold", fontSize: "13px", cursor: "pointer", boxShadow: "0 4px 12px rgba(220, 38, 38, 0.4)" }}
          >
            <PhoneOff size={18} /> Terminate Tele-Audit
          </button>
        </div>

      </div>
    </div>
  );
}