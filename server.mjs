
// import { RTCPeerConnection } from "werift";

// async function getOfferWithPublicIpCandidates() {
//   const pc = new RTCPeerConnection({
//     iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
//   });

//   pc.addTransceiver("audio");

//   const candidates = [];

// pc.onicecandidate = (event) => {
//   if (event.candidate) {
//     candidates.push(event.candidate);
//   } else {
//     console.log("ICE gathering complete.");
//     finalizeSDP();
//   }
// };

//   const offer = await pc.createOffer();
//   await pc.setLocalDescription(offer);

//   function finalizeSDP() {
//     let sdp = pc.localDescription.sdp;
//     // Try to find public (srflx) candidate
//     const srflx = candidates.find((c) =>
//       c.candidate.includes("typ srflx")
//     );

//     if (srflx) {
//       const match = srflx.candidate.match(/\d+\.\d+\.\d+\.\d+/);
//       if (match) {
//         const ip = match[0];
//         sdp = sdp.replace(/c=IN IP4 0\.0\.0\.0/g, `c=IN IP4 ${ip}`);
//       }
//     }

//     console.log("✅ Finalized SDP Offer with real IP:\n", sdp);
//   }
// }

// getOfferWithPublicIpCandidates().then(() => console.log("connect"));

// import http from "http";
// import { WebSocketServer } from "ws";
// import { RTCPeerConnection } from "werift";
// import dotenv from "dotenv";

// dotenv.config();

// const server = http.createServer();
// const wss = new WebSocketServer({ noServer: true });
// const metaWss = new WebSocketServer({ noServer: true });

// let activeMetaSocket = null;
// let activeBrowserWs = null;

// // 🔹 Helper: finalize SDP with public IP
// function finalizeSDP(pc, candidates) {
//   let sdp = pc.localDescription.sdp;
//   const srflx = candidates.find(c => c.candidate.includes("typ srflx"));
//   if (srflx) {
//     const match = srflx.candidate.match(/\d+\.\d+\.\d+\.\d+/);
//     if (match) {
//       const ip = match[0];
//       sdp = sdp.replace(/c=IN IP4 0\.0\.0\.0/g, `c=IN IP4 ${ip}`);
//       console.log("🌍 SDP public IP replaced with:", ip);
//     }
//   }
//   return sdp;
// }

// // 🔹 Create offer with audio transceiver & candidates
// async function createAudioOffer() {
//   const pc = new RTCPeerConnection({ iceServers: [{ urls: "stun:stun.l.google.com:19302" }] });
//   pc.addTransceiver("audio", { direction: "recvonly" });

//   const candidates = [];
//   pc.onicecandidate = (event) => {
//     if (event.candidate) candidates.push(event.candidate);
//   };

//   const offer = await pc.createOffer();
//   await pc.setLocalDescription(offer);

//   // Wait briefly to gather ICE candidates
//   await new Promise(resolve => setTimeout(resolve, 500));

//   const finalSDP = finalizeSDP(pc, candidates);
//   return { pc, sdp: finalSDP };
// }

// // ==================== META WEBSOCKET ====================
// metaWss.on("connection", (ws, req) => {
//   console.log("🔗 Meta WebSocket connected from", req.socket.remoteAddress);
//   activeMetaSocket = ws;

//   ws.on("message", async (message) => {
//     const data = JSON.parse(message.toString());
//     console.log("📩 From Meta:", data);

//     if (data.type === "offer") {
//       // Meta initiated call → create Browser offer + answer Meta
//       const { pc: pcMeta, sdp: metaAnswerSDP } = await createAudioOffer();
//       await pcMeta.setRemoteDescription({ type: "offer", sdp: data.sdp });

//       ws.send(JSON.stringify({ type: "answer", sdp: metaAnswerSDP }));

//       const { pc: pcClient, sdp: browserOfferSDP } = await createAudioOffer();
//       activeBrowserWs?.send(JSON.stringify({ type: "offer", sdp: browserOfferSDP }));
//     } else if (data.type === "answer") {
//       // Answer from Meta for previously sent offer
//       activePcMeta?.setRemoteDescription({ type: "answer", sdp: data.sdp });
//     }
//   });

//   ws.on("close", () => {
//     console.log("❌ Meta WebSocket disconnected");
//     activeMetaSocket = null;
//   });
// });

// // ==================== BROWSER WEBSOCKET ====================
// wss.on("connection", (ws) => {
//   console.log("📡 Browser connected");
//   activeBrowserWs = ws;

//   ws.on("message", async (message) => {
//     const { type, sdp } = JSON.parse(message.toString());

//     if (type === "offer") {
//       const { pc: pcClient, sdp: clientAnswerSDP } = await createAudioOffer();
//       await pcClient.setRemoteDescription({ type: "offer", sdp });

//       ws.send(JSON.stringify({ type: "answer", sdp: clientAnswerSDP }));

//       // Relay to Meta
//       const { pc: pcMeta, sdp: metaOfferSDP } = await createAudioOffer();
//       const metaPayload = {
//         AgentChatEventType: "call",
//         businessId: "YOUR_BUSINESS_ID",
//         FromPhoneId: "YOUR_PHONE_ID",
//         ToNumber: "919xxxxxxxxx",
//         sdpType: "offer",
//         sdp: metaOfferSDP,
//         callEvent: "connect",
//       };
//       activeMetaSocket?.send(JSON.stringify(metaPayload));
//     }
//   });

//   ws.on("close", () => {
//     console.log("❌ Browser disconnected");
//     activeBrowserWs = null;
//   });
// });

// // ==================== HTTP Upgrade ====================
// server.on("upgrade", (req, socket, head) => {
//   if (req.url === "/meta") {
//     metaWss.handleUpgrade(req, socket, head, (ws) => metaWss.emit("connection", ws, req));
//   } else {
//     wss.handleUpgrade(req, socket, head, (ws) => wss.emit("connection", ws, req));
//   }
// });

// const PORT = process.env.PORT || 8080;
// server.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));


const http = require("http");
const { WebSocketServer } = require("ws");
const { RTCPeerConnection } = require("werift");
require("dotenv").config();

const server = http.createServer();
const wss = new WebSocketServer({ noServer: true });
const metaWss = new WebSocketServer({ noServer: true });

let activeMetaSocket = null;
let activeBrowserWs = null;

let browserPC = null;
let metaPC = null;

// ---------------- Helper ----------------
function finalizeSDP(pc, candidates) {
  let sdp = pc.localDescription.sdp;
  const srflx = candidates.find(c => c.candidate.includes("typ srflx"));
  if (srflx) {
    const match = srflx.candidate.match(/\d+\.\d+\.\d+\.\d+/);
    if (match) {
      const ip = match[0];
      sdp = sdp.replace(/c=IN IP4 0\.0\.0\.0/g, `c=IN IP4 ${ip}`);
      console.log("🌍 SDP public IP replaced with:", ip);
    }
  }
  return sdp;
}

// ---------------- Create Audio PC ----------------
async function createAudioPC(direction = "sendrecv") {
  const pc = new RTCPeerConnection({ iceServers: [{ urls: "stun:stun.l.google.com:19302" }] });
  pc.addTransceiver("audio", { direction });

  const candidates = [];
  pc.onicecandidate = (event) => {
    if (event.candidate) candidates.push(event.candidate);
  };

  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);

  await new Promise(resolve => setTimeout(resolve, 500));
  const sdp = finalizeSDP(pc, candidates);
  return { pc, sdp };
}

// ---------------- META WEBSOCKET ----------------
metaWss.on("connection", async (ws, req) => {
  console.log("🔗 Meta WebSocket connected from", req.socket.remoteAddress);
  activeMetaSocket = ws;

  ws.on("message", async (message) => {
    const data = JSON.parse(message.toString());
    console.log("📩 From Meta:", data);

    if (data.type === "offer") {
      if (!metaPC) {
        const result = await createAudioPC("sendrecv");
        metaPC = result.pc;
        const answerSDP = result.sdp;

        await metaPC.setRemoteDescription({ type: "offer", sdp: data.sdp });
        ws.send(JSON.stringify({ type: "answer", sdp: answerSDP }));

        metaPC.onTrack.subscribe(track => {
          if (track.kind === "audio" && browserPC) {
            console.log("🎧 Track received from Meta:", track.id);
            browserPC.addTrack(track);
          }
        });
      }
    }
  });

  ws.on("close", () => {
    console.log("❌ Meta disconnected");
    activeMetaSocket = null;
    metaPC = null;
  });
});

// ---------------- BROWSER WEBSOCKET ----------------
wss.on("connection", async (ws) => {
  console.log("📡 Browser connected");
  activeBrowserWs = ws;

  if (!browserPC) {
    const result = await createAudioPC("sendrecv");
    browserPC = result.pc;

    browserPC.onTrack.subscribe(track => {
      if (track.kind === "audio" && metaPC) {
        console.log("🎤 Track received from Browser:", track.id);
        metaPC.addTrack(track);
      }
    });
  }

  ws.on("message", async (message) => {
    const { type, sdp } = JSON.parse(message.toString());
    if (type === "offer") {
      await browserPC.setRemoteDescription({ type: "offer", sdp });

      if (activeMetaSocket && !metaPC) {
        const result = await createAudioPC("sendrecv");
        metaPC = result.pc;
        const metaOfferSDP = result.sdp;
        activeMetaSocket.send(JSON.stringify({ type: "offer", sdp: metaOfferSDP }));
      }
    }
  });

  ws.on("close", () => {
    console.log("❌ Browser disconnected");
    activeBrowserWs = null;
    browserPC = null;
  });
});

// ---------------- HTTP Upgrade ----------------
server.on("upgrade", (req, socket, head) => {
  if (req.url === "/meta") {
    metaWss.handleUpgrade(req, socket, head, (ws) => metaWss.emit("connection", ws, req));
  } else {
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit("connection", ws, req));
  }
});

const PORT = process.env.PORT || 8080;
server.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));
