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

// 🧩 Browser WebSocket server
const BROWSER_PORT = process.env.BROWSER_PORT || 8080;
const browserServer = http.createServer();
const wss = new WebSocketServer({ server: browserServer });

browserServer.listen(BROWSER_PORT, () => {
  console.log(`✅ Browser WebSocket server running on port ${BROWSER_PORT}`);
});

// 🧩 Meta WebSocket server
const META_PORT = process.env.META_PORT || 9090;
const metaServer = http.createServer();
const metaWss = new WebSocketServer({ server: metaServer });

metaServer.listen(META_PORT, () => {
  console.log(`✅ Meta WebSocket server running on port ${META_PORT}`);
});

// 🔗 Active connections
let activeMetaSocket = null;
let activePcMeta = null; // store global reference to current Meta peer
let activeBrowserWs = null; // store browser connection to send back answers

// ✅ Meta connection
metaWss.on("connection", (ws, req) => {
  console.log("🔗 Meta WebSocket connected from", req.socket.remoteAddress);
  activeMetaSocket = ws;

  ws.on("message", async (message) => {
    const data = JSON.parse(message.toString());
    console.log("📩 From Meta:", data);

    // Handle answer from Meta
    if (data.type === "answer") {
      console.log("📥 Meta sent answer — setting remote description");
      await activePcMeta.setRemoteDescription({ type: "answer", sdp: data.sdp });
    }

    // Handle offer from Meta (Meta -> Browser)
    else if (data.type === "offer") {
      console.log("📞 Meta initiated a call — relaying offer to Browser");
      const pcClient = new RTCPeerConnection({
        iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
      });

      activePcMeta = new RTCPeerConnection({
        iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
      });

      await activePcMeta.setRemoteDescription({ type: "offer", sdp: data.sdp });
      activePcMeta.addTransceiver("audio", { direction: "recvonly" });

      const metaAnswer = await activePcMeta.createAnswer();
      await activePcMeta.setLocalDescription(metaAnswer);

      ws.send(JSON.stringify(activePcMeta.localDescription)); // send answer back to Meta

      // Create offer for Browser now
      pcClient.addTransceiver("audio", { direction: "recvonly" });
      const browserOffer = await pcClient.createOffer();
      await pcClient.setLocalDescription(browserOffer);

      activeBrowserWs.send(JSON.stringify(browserOffer));
    }
  });

  ws.on("close", () => {
    console.log("❌ Meta WebSocket disconnected");
    activeMetaSocket = null;
    activePcMeta = null;
  });
});

// ✅ Browser connection
wss.on("connection", (ws) => {
  console.log("📡 New browser connected");
  activeBrowserWs = ws;

  const pcClient = new RTCPeerConnection({
    iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
  });

  const pcMeta = new RTCPeerConnection({
    iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
  });

  activePcMeta = pcMeta;

  // 🎙️ Browser → Meta audio
  pcClient.onTrack.subscribe((track) => {
    if (track.kind === "audio") {
      pcMeta.addTrack(track);

      const opusStream = new Prism.opus.Decoder({ frameSize: 960, channels: 1, rate: 48000 });
      const wavWriter = new WavWriter({ sampleRate: 48000, channels: 1, bitDepth: 16 });
      const outputFile = fs.createWriteStream(`call_${Date.now()}.wav`);

      opusStream.pipe(wavWriter).pipe(outputFile);
      track.onReceiveRtp.subscribe((rtp) => opusStream.write(rtp.payload));
    }
  });

  // 🎧 Meta → Browser audio
  pcMeta.onTrack.subscribe((track) => {
    if (track.kind === "audio") pcClient.addTrack(track);
  });

  // 📨 Browser sends SDP offer
  ws.on("message", async (message) => {
    const { type, sdp } = JSON.parse(message);

    if (type === "offer") {
      await pcClient.setRemoteDescription({ type, sdp });
      pcClient.addTransceiver("audio", { direction: "recvonly" });

      const clientAnswer = await pcClient.createAnswer();
      await pcClient.setLocalDescription(clientAnswer);
      ws.send(JSON.stringify(pcClient.localDescription));

      // Create Meta offer
      pcMeta.addTransceiver("audio", { direction: "recvonly" });
      const metaOffer = await pcMeta.createOffer();
      await pcMeta.setLocalDescription(metaOffer);

      const metaPayload = {
        AgentChatEventType: "call",
        businessId: 363906680148599,
        FromPhoneId: 385840701287764,
        ToNumber: 919625534956,
        sdpType: metaOffer.type,
        sdp: metaOffer.sdp,
        callEvent: "connect",
      };

      console.log("📤 Sending offer to Meta WebSocket server:", metaPayload);
      activeMetaSocket?.send(JSON.stringify(metaPayload));
    }
  });

  ws.on("close", () => {
    pcClient.close();
    pcMeta.close();
    console.log("❌ Browser disconnected, PeerConnections closed");
  });
});
