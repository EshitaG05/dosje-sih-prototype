import React from "react";
import { MapContainer, TileLayer, Marker, Popup, Circle } from "react-leaflet";
import L from "leaflet";

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

const ngoIcon = new L.Icon({
  iconUrl: "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png",
  shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

const inspectorIcon = new L.Icon({
  iconUrl: "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-blue.png",
  shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

export default function GeoFenceMap({ ngoLat, ngoLon, inspectorLat, inspectorLon, isInside }) {
  const center = [ngoLat || 26.8439, ngoLon || 75.5652];

  return (
    <div style={{ height: "240px", width: "100%", borderRadius: "8px", overflow: "hidden", border: "1px solid #334155", marginTop: "10px" }}>
      <MapContainer center={center} zoom={15} scrollWheelZoom={false} style={{ height: "100%", width: "100%" }}>
        <TileLayer
          attribution='&copy; OpenStreetMap contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        <Circle
          center={center}
          radius={200}
          pathOptions={{
            color: isInside ? "#22c55e" : "#ef4444",
            fillColor: isInside ? "#22c55e" : "#ef4444",
            fillOpacity: 0.25,
          }}
        />

        <Marker position={center} icon={ngoIcon}>
          <Popup>Target NGO: 200m Enforced Zone</Popup>
        </Marker>

        {inspectorLat && inspectorLon && (
          <Marker position={[inspectorLat, inspectorLon]} icon={inspectorIcon}>
            <Popup>{isInside ? "Inside Perimeter" : "Outside Perimeter"}</Popup>
          </Marker>
        )}
      </MapContainer>
    </div>
  );
}