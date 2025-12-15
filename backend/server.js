// backend/server.js
// 1) connects to AISStream with your API key (kept private)
// 2) subscribes to a bounding box
// 3) re-broadcasts PositionReport updates to your browser via websocket

require("dotenv").config();
const WebSocket = require("ws");

const AISSTREAM_URL = "wss://stream.aisstream.io/v0/stream";

const AIS_API_KEY = process.env.AIS_API_KEY;
if (!AIS_API_KEY) {
  console.error("Missing AIS_API_KEY in .env");
  process.exit(1);
}

console.log("API key loaded:", !!process.env.AIS_API_KEY);

// Change this bounding box to where you want to see ships.
// Format: [ [southWestLat, southWestLon], [northEastLat, northEastLon] ]
const BOUNDING_BOXES = [
  [[40.55, -74.30], [40.90, -73.60]] // NYC harbor + approaches
];

// 1) Local WebSocket server for your browser to connect to
const localWss = new WebSocket.Server({ port: 8081 });
console.log("Local WS server listening on ws://localhost:8081");

// Track browser clients
const clients = new Set();
localWss.on("connection", (ws) => {
  clients.add(ws);
  ws.send(JSON.stringify({ type: "status", message: "Connected to local relay" }));

  ws.on("close", () => clients.delete(ws));
});

// Broadcast helper
function broadcast(obj) {
  const msg = JSON.stringify(obj);
  for (const ws of clients) {
    if (ws.readyState === WebSocket.OPEN) ws.send(msg);
  }
}

// 2) Connect to AISStream with auto reconnect
function connectUpstream() {
  console.log("Connecting to AISStream...");

  const upstream = new WebSocket(AISSTREAM_URL);

  upstream.on("open", () => {
    console.log("Connected to AISStream");

    const subscribeMessage = {
      APIKey: AIS_API_KEY,
      BoundingBoxes: BOUNDING_BOXES,
      FilterMessageTypes: ["PositionReport"]
    };

    const payload = JSON.stringify(subscribeMessage);
    upstream.send(payload);

    console.log("Sent subscribe message:", payload);
    broadcast({ type: "status", message: "Subscribed to AISStream" });
  });

  upstream.on("message", (data) => {
    try {
      const msg = JSON.parse(data.toString());

      // Debug logs (optional)
      if (msg?.MessageType) {
        console.log("Upstream type:", msg.MessageType);
      }

      const pr = msg?.Message?.PositionReport;
      if (pr) {
        console.log("PositionReport:", pr.UserID, pr.Latitude, pr.Longitude);
      }

      // Forward to browser clients
      broadcast({ type: "ais", payload: msg });
    } catch (e) {
      console.log("Bad JSON from upstream (rare)");
    }
  });

  upstream.on("close", () => {
    console.log("AISStream connection closed. Reconnecting in 3 seconds...");
    broadcast({ type: "status", message: "AISStream disconnected, reconnecting..." });

    setTimeout(connectUpstream, 3000);
  });

  upstream.on("error", (err) => {
    console.error("AISStream error:", err.message);
    broadcast({ type: "status", message: "AISStream error: " + err.message });
  });
}

connectUpstream();
