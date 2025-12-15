console.log("script.js loaded");

// Map
const map = L.map("map").setView([40.70, -74.05], 10);

L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19,
  attribution: '&copy; OpenStreetMap contributors'
}).addTo(map);

// Marker cache (Mode A)
const shipMarkers = new Map();

function upsertShipMarker(mmsi, lat, lon) {
  const key = String(mmsi);
  if (!key || lat == null || lon == null) return;

  const pos = [lat, lon];

  if (shipMarkers.has(key)) {
    shipMarkers.get(key).setLatLng(pos);
  } else {
    const marker = L.circleMarker(pos, { radius: 6 }).addTo(map);
    marker.bindPopup(`MMSI: ${key}`);
    shipMarkers.set(key, marker);
  }
}

// Connect to your local relay
const ws = new WebSocket("ws://localhost:8081");

ws.onopen = () => console.log("Browser connected to local relay");
ws.onclose = () => console.log("Browser WS closed");
ws.onerror = (e) => console.log("Browser WS error", e);

ws.onmessage = (event) => {
  const msg = JSON.parse(event.data);

  if (msg.type === "status") {
    console.log("STATUS:", msg.message);
    return;
  }

  if (msg.type === "ais") {
    const pr = msg.payload?.Message?.PositionReport;
    if (!pr) return;

    upsertShipMarker(pr.UserID, pr.Latitude, pr.Longitude);
  }
};
