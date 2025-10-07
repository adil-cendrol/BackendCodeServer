// import http from "http";
// import { WebSocketServer } from "ws";
// import WebSocket from "ws"; // for Meta connection
// import { RTCPeerConnection } from "werift";
// import Prism from "prism-media";
// import { Writer as WavWriter } from "wav";
// import fs from "fs";
// import dotenv from "dotenv";

// dotenv.config();

// // ✅ Create HTTP server (Render requires this)
// const PORT = process.env.PORT || 8080;
// const server = http.createServer();

// // ✅ Attach WebSocket server
// const wss = new WebSocketServer({ server });
// server.listen(PORT, () => {
//   console.log(`✅ WebSocket server running on port ${PORT}`);
// });

// // ✅ Meta WebSocket connection
// const META_WS_URL = process.env.META_WS_URL;
// const metaWs = new WebSocket(META_WS_URL);

// metaWs.on("open", () => console.log("✅ Connected to Meta WebSocket"));

// metaWs.on("message", async (message) => {
//   const data = JSON.parse(message.toString());
//   console.log("📩 From Meta:", data);

//   if (data.type === "answer" && global.pcMeta) {
//     await global.pcMeta.setRemoteDescription({ type: "answer", sdp: data.sdp });
//   }

//   if (data.type === "offer" && global.pcMeta) {
//     await global.pcMeta.setRemoteDescription({ type: "offer", sdp: data.sdp });
//     const answer = await global.pcMeta.createAnswer();
//     await global.pcMeta.setLocalDescription(answer);

//     const answerPayload = {
//       AgentChatEventType: "call",
//       businessId: "",
//       FromPhoneId: "",
//       ToNumber: "",
//       sdpType: answer.type,
//       sdp: answer.sdp,
//       callEvent: "connect",
//     };

//     console.log("📤 Sending answer to Meta:", answerPayload);
//     metaWs.send(JSON.stringify(answerPayload));
//   }
// });

// // ✅ Handle new browser WebSocket connections
// wss.on("connection", async (ws) => {
//   console.log("📡 New browser connected");

//   const pcClient = new RTCPeerConnection({
//     iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
//   });

//   const pcMeta = new RTCPeerConnection({
//     iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
//   });

//   global.pcMeta = pcMeta; // so Meta message handler can access it

//   // 🎙️ Browser → Meta audio forward
//   pcClient.onTrack.subscribe((track) => {
//     if (track.kind === "audio") {
//       pcMeta.addTrack(track);

//       const opusStream = new Prism.opus.Decoder({ frameSize: 960, channels: 1, rate: 48000 });
//       const wavWriter = new WavWriter({ sampleRate: 48000, channels: 1, bitDepth: 16 });
//       const outputFile = fs.createWriteStream("call_record.wav");

//       opusStream.pipe(wavWriter).pipe(outputFile);

//       track.onReceiveRtp.subscribe((rtp) => opusStream.write(rtp.payload));
//     }
//   });

//   // 🎧 Meta → Browser audio forward
//   pcMeta.onTrack.subscribe((track) => {
//     if (track.kind === "audio") {
//       pcClient.addTrack(track);
//     }
//   });

//   // 📨 Browser sends SDP offer
//   ws.on("message", async (message) => {
//     const { type, sdp } = JSON.parse(message);

//     if (type === "offer") {
//       await pcClient.setRemoteDescription({ type, sdp });
//       pcClient.addTransceiver("audio", { direction: "recvonly" });
//       const clientAnswer = await pcClient.createAnswer();
//       await pcClient.setLocalDescription(clientAnswer);
//       ws.send(JSON.stringify(pcClient.localDescription));

//       // Create offer for Meta
//       pcMeta.addTransceiver("audio", { direction: "recvonly" });
//       const metaOffer = await pcMeta.createOffer();
//       await pcMeta.setLocalDescription(metaOffer);

//       const metaPayload = {
//         AgentChatEventType: "call",
//         businessId: 363906680148599,
//         FromPhoneId: 385840701287764,
//         ToNumber: 919625534956,
//         sdpType: metaOffer.type,
//         sdp: metaOffer.sdp,
//         callEvent: "connect",
//       };

//       console.log("📤 Sending Meta offer:", metaPayload);
//       metaWs.send(JSON.stringify(metaPayload));
//     }
//   });

//   ws.on("close", () => {
//     pcClient.close();
//     pcMeta.close();
//     console.log("❌ Browser disconnected, closing PeerConnections");
//   });
// });

import http from "http";
import { WebSocketServer } from "ws";
import { RTCPeerConnection, MediaStreamTrack } from "werift";
import Prism from "prism-media";
import { Writer as WavWriter } from "wav";
import fs from "fs";
import dotenv from "dotenv";

dotenv.config();
const PORT = process.env.PORT || 8080;

// --- HTTP + WebSocket servers ---
const server = http.createServer();
const wss = new WebSocketServer({ noServer: true });      // Browser WS
const metaWss = new WebSocketServer({ noServer: true });  // Meta WS

// --- Active connections ---
let activeBrowserWs = null;
let activeMetaWs = null;
let pcClient = null;
let pcMeta = null;

// --- ICE candidate helper ---
function setupIce(pc, name, ws) {
  pc.onIceCandidate.subscribe((candidate) => {
    if (candidate) {
      ws?.send(JSON.stringify({ type: "ice", candidate }));
      console.log(`🌐 ICE Candidate from ${name}:`, candidate.address, candidate.type);
    }
  });
}

// --- Wait for ICE gathering to complete ---
function waitForIceGathering(pc) {
  return new Promise((resolve) => {
    if (pc.iceGatheringState === "complete") return resolve();
    pc.onIceGatheringStateChange = () => {
      if (pc.iceGatheringState === "complete") resolve();
    };
  });
}

// --- WebSocket upgrade handler ---
server.on("upgrade", (req, socket, head) => {
  if (req.url === "/meta") {
    metaWss.handleUpgrade(req, socket, head, (ws) => metaWss.emit("connection", ws, req));
  } else {
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit("connection", ws, req));
  }
});

// =================== META WS ===================
metaWss.on("connection", (ws, req) => {
  console.log("🔗 Meta connected from", req.socket.remoteAddress);
  activeMetaWs = ws;

  ws.on("message", async (msg) => {
    try {
      const data = JSON.parse(msg.toString());

      // Handle answer from Meta
      if (data.type === "answer" && pcMeta) {
        await pcMeta.setRemoteDescription({ type: "answer", sdp: data.sdp });
      }

      // Handle offer from Meta
      else if (data.type === "offer") {
        console.log("📞 Meta initiated call");

        // Create PeerConnections with STUN
        pcClient = new RTCPeerConnection({
          iceServers: [
            { urls: "stun:stun.l.google.com:19302" },

            { urls: "stun:stun1.l.google.com:19302" },

          ]
        });
        pcMeta = new RTCPeerConnection({
          iceServers: [{ urls: "stun:stun.l.google.com:19302" },

          { urls: "stun:stun.l.google.com:19302" },



          ]
        });

        setupIce(pcClient, "Browser PC", activeBrowserWs);
        setupIce(pcMeta, "Meta PC", activeMetaWs);

        // Relay audio from Meta to Browser
        pcMeta.onTrack.subscribe((track) => {
          if (track.kind === "audio") pcClient.addTrack(track);
        });

        // Relay audio from Browser to Meta + record
        pcClient.onTrack.subscribe((track) => {
          if (track.kind === "audio") pcMeta.addTrack(track);

          const opus = new Prism.opus.Decoder({ frameSize: 960, channels: 1, rate: 48000 });
          const wav = new WavWriter({ sampleRate: 48000, channels: 1, bitDepth: 16 });
          const outFile = fs.createWriteStream(`call_${Date.now()}.wav`);
          opus.pipe(wav).pipe(outFile);

          track.onReceiveRtp.subscribe((rtp) => opus.write(rtp.payload));
        });

        // Process Meta offer
        await pcMeta.setRemoteDescription({ type: "offer", sdp: data.sdp });
        pcMeta.addTransceiver("audio", { direction: "recvonly" });
        const metaAnswer = await pcMeta.createAnswer();
        await pcMeta.setLocalDescription(metaAnswer);
        await waitForIceGathering(pcMeta);

        // Send Meta SDP answer with full ICE candidates
        activeMetaWs.send(JSON.stringify(pcMeta.localDescription));

        // Create Browser offer
        pcClient.addTransceiver("audio", { direction: "recvonly" });
        const browserOffer = await pcClient.createOffer();
        await pcClient.setLocalDescription(browserOffer);
        await waitForIceGathering(pcClient);

        // Send Browser SDP offer with ICE candidates
        activeBrowserWs?.send(JSON.stringify(pcClient.localDescription));
      }

      // Handle ICE candidates from Meta
      else if (data.type === "ice" && pcMeta) {
        await pcMeta.addIceCandidate(data.candidate);
      }

    } catch (err) {
      console.error("❌ Meta WS error:", err);
    }
  });

  ws.on("close", () => {
    activeMetaWs = null;
  });
});

// =================== BROWSER WS ===================
wss.on("connection", (ws) => {
  console.log("📡 Browser connected");
  activeBrowserWs = ws;

  ws.on("message", async (msg) => {
    try {
      const data = JSON.parse(msg);

      // Handle ICE candidate from Browser
      if (data.type === "ice" && pcClient) {
        await pcClient.addIceCandidate(data.candidate);
      }

      // Browser offer
      if (data.type === "offer") {
        console.log("📥 Browser SDP offer received");

        pcClient = new RTCPeerConnection({
          iceServers: [{ urls: "stun:stun.l.google.com:19302" } , { urls: "stun:stun.l.google.com:19302" }]
        });
        pcMeta = new RTCPeerConnection({
          iceServers: [{ urls: "stun:stun.l.google.com:19302" } , { urls: "stun:stun.l.google.com:19302" }]
        });

        setupIce(pcClient, "Browser PC", activeMetaWs);
        setupIce(pcMeta, "Meta PC", activeMetaWs);

        // Relay Browser audio → Meta
        pcClient.onTrack.subscribe((track) => {
          if (track.kind === "audio") pcMeta.addTrack(track);

          const opus = new Prism.opus.Decoder({ frameSize: 960, channels: 1, rate: 48000 });
          const wav = new WavWriter({ sampleRate: 48000, channels: 1, bitDepth: 16 });
          const outFile = fs.createWriteStream(`call_${Date.now()}.wav`);
          opus.pipe(wav).pipe(outFile);
          track.onReceiveRtp.subscribe((rtp) => opus.write(rtp.payload));
        });

        // Relay Meta audio → Browser
        pcMeta.onTrack.subscribe((track) => {
          if (track.kind === "audio") pcClient.addTrack(track);
        });

        await pcClient.setRemoteDescription({ type: "offer", sdp: data.sdp });
        pcClient.addTransceiver("audio", { direction: "sendrecv" });

        // Send answer to Browser
        const clientAnswer = await pcClient.createAnswer();
        await pcClient.setLocalDescription(clientAnswer);
        await waitForIceGathering(pcClient);
        ws.send(JSON.stringify(pcClient.localDescription));

        // Create Meta offer
        pcMeta.addTransceiver("audio", { direction: "sendrecv" });
        const metaOffer = await pcMeta.createOffer();
        await pcMeta.setLocalDescription(metaOffer);
        await waitForIceGathering(pcMeta);

        // Send Meta SDP
        const metaPayload = {
          AgentChatEventType: "call",
          businessId: 363906680148599,
          FromPhoneId: 385840701287764,
          ToNumber: 919625534956,
          sdpType: pcMeta.localDescription.type,
          sdp: pcMeta.localDescription.sdp,
          callEvent: "connect",
        };
        activeMetaWs?.send(JSON.stringify(metaPayload));
      }

    } catch (err) {
      console.error("❌ Browser WS error:", err);
    }
  });

  ws.on("close", () => {
    pcClient?.close();
    pcMeta?.close();
    activeBrowserWs = null;
  });
});

// =================== Start server ===================
server.listen(PORT, () => {
  console.log(`✅ WebSocket server running on ws://localhost:${PORT}`);
});
