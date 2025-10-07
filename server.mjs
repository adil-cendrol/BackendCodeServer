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
import { RTCPeerConnection } from "werift";
import Prism from "prism-media";
import { Writer as WavWriter } from "wav";
import fs from "fs";
import dotenv from "dotenv";

dotenv.config();

const server = http.createServer();
const wss = new WebSocketServer({ noServer: true });
const metaWss = new WebSocketServer({ noServer: true });

// 🔗 Active connections
let activeMetaSocket = null;
let activeBrowserWs = null;
let pcClient = null;
let pcMeta = null;

// ========================= Helper =========================
// Replace 0.0.0.0 with 127.0.0.1 in SDP
function fixSdp(sdp) {
  return sdp.replace(/c=IN IP4 0.0.0.0/g, 'c=IN IP4 127.0.0.1');
}

// Setup ICE candidates logging & sending
function setupIce(pc, name, sendCandidateFn) {
  pc.onIceCandidate.subscribe((candidate) => {
    console.log(`🌐 ICE Candidate from ${name}:`, candidate);
    if (candidate) sendCandidateFn?.(candidate);
  });
}

// ========================= META WS =========================
metaWss.on("connection", (ws, req) => {
  console.log("🔗 Meta WebSocket connected from", req.socket.remoteAddress);
  activeMetaSocket = ws;

  ws.on("message", async (message) => {
    try {
      const data = JSON.parse(message.toString());
      console.log("📩 From Meta:", data);

      if (data.type === "answer" && pcMeta) {
        console.log("📥 Setting remote description from Meta answer");
        await pcMeta.setRemoteDescription({ type: "answer", sdp: data.sdp });
      } else if (data.type === "offer") {
        console.log("📞 Meta initiated call, creating local PeerConnections");

        pcClient = new RTCPeerConnection({ iceServers: [{ urls: "stun:stun.l.google.com:19302" }] });
        pcMeta = new RTCPeerConnection({ iceServers: [{ urls: "stun:stun.l.google.com:19302" }] });

        setupIce(pcClient, "Browser PC", (candidate) => activeBrowserWs?.send(JSON.stringify({ type: "ice", candidate })));
        setupIce(pcMeta, "Meta PC", (candidate) => activeMetaSocket?.send(JSON.stringify({ type: "ice", candidate })));

        pcMeta.onTrack.subscribe((track) => {
          if (track.kind === "audio") pcClient.addTrack(track);
        });

        pcClient.onTrack.subscribe((track) => {
          if (track.kind === "audio") pcMeta.addTrack(track);

          // Optional: save audio
          const opusStream = new Prism.opus.Decoder({ frameSize: 960, channels: 1, rate: 48000 });
          const wavWriter = new WavWriter({ sampleRate: 48000, channels: 1, bitDepth: 16 });
          const outputFile = fs.createWriteStream(`call_${Date.now()}.wav`);
          opusStream.pipe(wavWriter).pipe(outputFile);
          track.onReceiveRtp.subscribe((rtp) => opusStream.write(rtp.payload));
        });

        // Handle Meta offer
        await pcMeta.setRemoteDescription({ type: "offer", sdp: data.sdp });
        pcMeta.addTransceiver("audio", { direction: "recvonly" });
        const metaAnswer = await pcMeta.createAnswer();
        await pcMeta.setLocalDescription(metaAnswer);

        // Fix SDP before sending
        const fixedMetaAnswer = { ...pcMeta.localDescription, sdp: fixSdp(pcMeta.localDescription.sdp) };
        ws.send(JSON.stringify(fixedMetaAnswer));

        // Create offer for Browser
        pcClient.addTransceiver("audio", { direction: "recvonly" });
        const browserOffer = await pcClient.createOffer();
        await pcClient.setLocalDescription(browserOffer);

        const fixedBrowserOffer = { ...pcClient.localDescription, sdp: fixSdp(pcClient.localDescription.sdp) };
        activeBrowserWs?.send(JSON.stringify(fixedBrowserOffer));
      } else if (data.type === "ice") {
        if (pcMeta) await pcMeta.addIceCandidate(data.candidate);
      }
    } catch (err) {
      console.error("❌ Error processing Meta message:", err);
    }
  });

  ws.on("close", () => {
    console.log("❌ Meta WebSocket disconnected");
    activeMetaSocket = null;
  });

  ws.on("error", (err) => console.error("❌ Meta WS error:", err));
});

// ========================= BROWSER WS =========================
wss.on("connection", (ws) => {
  console.log("📡 Browser connected");
  activeBrowserWs = ws;

  ws.on("message", async (message) => {
    try {
      const data = JSON.parse(message);

      if (data.type === "ice" && pcClient) {
        await pcClient.addIceCandidate(data.candidate);
      }

      if (data.type === "offer") {
        console.log("📥 Received Browser SDP offer");

        pcClient = new RTCPeerConnection({ iceServers: [{ urls: "stun:stun.l.google.com:19302" }] });
        pcMeta = new RTCPeerConnection({ iceServers: [{ urls: "stun:stun.l.google.com:19302" }] });

        setupIce(pcClient, "Browser PC", (candidate) => activeMetaSocket?.send(JSON.stringify({ type: "ice", candidate })));
        setupIce(pcMeta, "Meta PC", (candidate) => activeMetaSocket?.send(JSON.stringify({ type: "ice", candidate })));

        pcClient.onTrack.subscribe((track) => {
          if (track.kind === "audio") pcMeta.addTrack(track);

          const opusStream = new Prism.opus.Decoder({ frameSize: 960, channels: 1, rate: 48000 });
          const wavWriter = new WavWriter({ sampleRate: 48000, channels: 1, bitDepth: 16 });
          const outputFile = fs.createWriteStream(`call_${Date.now()}.wav`);
          opusStream.pipe(wavWriter).pipe(outputFile);
          track.onReceiveRtp.subscribe((rtp) => opusStream.write(rtp.payload));
        });

        pcMeta.onTrack.subscribe((track) => {
          if (track.kind === "audio") pcClient.addTrack(track);
        });

        await pcClient.setRemoteDescription({ type: "offer", sdp: data.sdp });
        pcClient.addTransceiver("audio", { direction: "recvonly" });

        const clientAnswer = await pcClient.createAnswer();
        await pcClient.setLocalDescription(clientAnswer);

        const fixedClientAnswer = { ...pcClient.localDescription, sdp: fixSdp(pcClient.localDescription.sdp) };
        ws.send(JSON.stringify(fixedClientAnswer));

        pcMeta.addTransceiver("audio", { direction: "recvonly" });
        const metaOffer = await pcMeta.createOffer();
        await pcMeta.setLocalDescription(metaOffer);

        const fixedMetaOffer = { ...pcMeta.localDescription, sdp: fixSdp(pcMeta.localDescription.sdp) };
        const metaPayload = {
          AgentChatEventType: "call",
          businessId: 363906680148599,
          FromPhoneId: 385840701287764,
          ToNumber: 919625534956,
          sdpType: fixedMetaOffer.type,
          sdp: fixedMetaOffer.sdp,
          callEvent: "connect",
        };

        console.log("📤 Sending offer to Meta:", metaPayload);
        activeMetaSocket?.send(JSON.stringify(metaPayload));
      }
    } catch (err) {
      console.error("❌ Error processing Browser message:", err);
    }
  });

  ws.on("close", () => {
    pcClient?.close();
    pcMeta?.close();
    console.log("❌ Browser disconnected, PeerConnections closed");
  });

  ws.on("error", (err) => console.error("❌ Browser WS error:", err));
});

// ========================= SERVER UPGRADE =========================
server.on("upgrade", (req, socket, head) => {
  if (req.url === "/meta") {
    metaWss.handleUpgrade(req, socket, head, (ws) => metaWss.emit("connection", ws, req));
  } else {
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit("connection", ws, req));
  }
});

server.listen(process.env.PORT || 8080, () => {
  console.log(`✅ Unified WebSocket server running`);
});
