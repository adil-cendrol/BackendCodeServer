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

// import http from "http";
// import { WebSocketServer } from "ws";
// import { RTCPeerConnection } from "werift";
// import Prism from "prism-media";
// import { Writer as WavWriter } from "wav";
// import fs from "fs";
// import dotenv from "dotenv";

// dotenv.config();

// const server = http.createServer();
// const wss = new WebSocketServer({ noServer: true });
// const metaWss = new WebSocketServer({ noServer: true });

// // 🔗 Active connections
// let activeMetaSocket = null;
// let activePcMeta= null;
// let activeBrowserWs = null;

// // Helper: wait for ICE gathering
// async function gatherIce(pc) {
//   return new Promise((resolve) => {
//     pc.onIceCandidate.subscribe((candidate) => {
//       if (!candidate) resolve(); // null candidate signals gathering finished
//     });
//   });
// }

// // ✅ Meta WebSocket
// metaWss.on("connection", (ws, req) => {
//   console.log("🔗 Meta WebSocket connected from", req.socket.remoteAddress);
//   activeMetaSocket = ws;

//   ws.on("message", async (message) => {
//     const data = JSON.parse(message.toString());
//     console.log("📩 From Meta:", data);

//     if (data.type === "answer") {
//       await activePcMeta?.setRemoteDescription({ type: "answer", sdp: data.sdp });
//     } else if (data.type === "offer") {
//       // Meta initiated a call → relay to Browser
//       const pcClient = new RTCPeerConnection({
//         iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
//       });

//       activePcMeta = new RTCPeerConnection({
//         iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
//       });

//       await activePcMeta.setRemoteDescription({ type: "offer", sdp: data.sdp });
//       activePcMeta.addTransceiver("audio", { direction: "recvonly" });

//       const metaAnswer = await activePcMeta.createAnswer();
//       await activePcMeta.setLocalDescription(metaAnswer);
//       await gatherIce(activePcMeta);

//       ws.send(JSON.stringify(activePcMeta.localDescription));

//       pcClient.addTransceiver("audio", { direction: "recvonly" });
//       const browserOffer = await pcClient.createOffer();
//       await pcClient.setLocalDescription(browserOffer);
//       await gatherIce(pcClient);

//       activeBrowserWs?.send(JSON.stringify(browserOffer));
//     }
//   });

//   ws.on("close", () => {
//     console.log("❌ Meta WebSocket disconnected");
//     activeMetaSocket = null;
//     activePcMeta = null;
//   });
// });

// // ✅ Browser WebSocket
// wss.on("connection", (ws) => {
//   console.log("📡 New browser connected");
//   activeBrowserWs = ws;

//   const pcClient = new RTCPeerConnection({ iceServers: [{ urls: "stun:stun.l.google.com:19302" }] });
//   const pcMeta = new RTCPeerConnection({ iceServers: [{ urls: "stun:stun.l.google.com:19302" }] });
//   activePcMeta = pcMeta;

//   // Browser → Meta audio
//   pcClient.onTrack.subscribe((track) => {
//     if (track.kind === "audio") {
//       pcMeta.addTrack(track);

//       const opusStream = new Prism.opus.Decoder({ frameSize: 960, channels: 1, rate: 48000 });
//       const wavWriter = new WavWriter({ sampleRate: 48000, channels: 1, bitDepth: 16 });
//       const outputFile = fs.createWriteStream(`call_${Date.now()}.wav`);
//       opusStream.pipe(wavWriter).pipe(outputFile);
//       track.onReceiveRtp.subscribe((rtp) => opusStream.write(rtp.payload));
//     }
//   });

//   // Meta → Browser audio
//   pcMeta.onTrack.subscribe((track) => {
//     if (track.kind === "audio") pcClient.addTrack(track);
//   });

//   // Handle Browser SDP offer
//   ws.on("message", async (message) => {
//     const { type, sdp } = JSON.parse(message);

//     if (type === "offer") {
//       await pcClient.setRemoteDescription({ type, sdp });
//       pcClient.addTransceiver("audio", { direction: "recvonly" });

//       const clientAnswer = await pcClient.createAnswer();
//       await pcClient.setLocalDescription(clientAnswer);
//       await gatherIce(pcClient);
//       ws.send(JSON.stringify(pcClient.localDescription));

//       // Create Meta offer with ICE candidates
//       pcMeta.addTransceiver("audio", { direction: "recvonly" });
//       const metaOffer = await pcMeta.createOffer();
//       await pcMeta.setLocalDescription(metaOffer);
//       await gatherIce(pcMeta);

//       const metaPayload = {
//         AgentChatEventType: "call",
//         businessId: 363906680148599,
//         FromPhoneId: 385840701287764,
//         ToNumber: 919625534956,
//         sdpType: pcMeta.localDescription?.type,
//         sdp: pcMeta.localDescription?.sdp,
//         callEvent: "connect",
//       };

//       console.log("📤 Sending offer to Meta WebSocket server:", metaPayload);
//       activeMetaSocket?.send(JSON.stringify(metaPayload));
//     }
//   });

//   ws.on("close", () => {
//     pcClient.close();
//     pcMeta.close();
//     console.log("❌ Browser disconnected, PeerConnections closed");
//   });
// });

// // Upgrade handling
// server.on("upgrade", (req, socket, head) => {
//   if (req.url === "/meta") {
//     metaWss.handleUpgrade(req, socket, head, (ws) => metaWss.emit("connection", ws, req));
//   } else {
//     wss.handleUpgrade(req, socket, head, (ws) => wss.emit("connection", ws, req));
//   }
// });



// import { RTCPeerConnection } from "werift";

// async function getOfferWithPublicIpCandidates() {
//   const pc = new RTCPeerConnection({
//     iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
//   });

//   pc.addTransceiver("audio");

//   const candidates = [];

//   pc.onicecandidate = (event) => {
//     if (event.candidate) {
//       candidates.push(event.candidate);
//     } else {
//       console.log("ICE gathering complete.");
//       finalizeSDP();
//     }
//   };

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
let activePcMeta = null;
let activeBrowserWs = null;

// ✅ Helper: wait for ICE gathering and return all candidates
async function gatherIce(pc) {
  return new Promise((resolve) => {
    const candidates = [];
    pc.onIceCandidate.subscribe((candidate) => {
      if (candidate) {
        candidates.push(candidate.toJSON().candidate);
      } else {
        resolve(candidates); // gathering finished
      }
    });
  });
}

// ✅ Helper: replace 0.0.0.0 in SDP with public IP (from srflx)
function finalizeSDP(sdp, candidates) {
  const srflx = candidates.find((c) => c.includes("typ srflx"));
  if (srflx) {
    const match = srflx.match(/\d+\.\d+\.\d+\.\d+/);
    if (match) {
      const ip = match[0];
      sdp = sdp.replace(/c=IN IP4 0\.0\.0\.0/g, `c=IN IP4 ${ip}`);
      console.log("🌍 SDP public IP replaced with:", ip);
    }
  } else {
    console.log("⚠️ No srflx candidate found — SDP still using 0.0.0.0");
  }
  return sdp;
}

// ✅ Meta WebSocket
metaWss.on("connection", (ws, req) => {
  console.log("🔗 Meta WebSocket connected from", req.socket.remoteAddress);
  activeMetaSocket = ws;

  ws.on("message", async (message) => {
    const data = JSON.parse(message.toString());
    console.log("📩 From Meta:", data);

    if (data.type === "answer") {
      await activePcMeta?.setRemoteDescription({ type: "answer", sdp: data.sdp });
    } else if (data.type === "offer") {
      // Meta initiated a call → relay to Browser
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
      await gatherIce(activePcMeta);

      ws.send(JSON.stringify(activePcMeta.localDescription));

      pcClient.addTransceiver("audio", { direction: "recvonly" });
      const browserOffer = await pcClient.createOffer();
      await pcClient.setLocalDescription(browserOffer);
      await gatherIce(pcClient);

      activeBrowserWs?.send(JSON.stringify(browserOffer));
    }
  });

  ws.on("close", () => {
    console.log("❌ Meta WebSocket disconnected");
    activeMetaSocket = null;
    activePcMeta = null;
  });
});

// ✅ Browser WebSocket
wss.on("connection", (ws) => {
  console.log("📡 New browser connected");
  activeBrowserWs = ws;

  const pcClient = new RTCPeerConnection({ iceServers: [{ urls: "stun:stun.l.google.com:19302" }] });
  const pcMeta = new RTCPeerConnection({ iceServers: [{ urls: "stun:stun.l.google.com:19302" }] });
  activePcMeta = pcMeta;

  // Browser → Meta audio
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

  // Meta → Browser audio
  pcMeta.onTrack.subscribe((track) => {
    if (track.kind === "audio") pcClient.addTrack(track);
  });

  // Handle Browser SDP offer
  ws.on("message", async (message) => {
    const { type, sdp } = JSON.parse(message);

    if (type === "offer") {
      await pcClient.setRemoteDescription({ type, sdp });
      pcClient.addTransceiver("audio", { direction: "recvonly" });

      const clientAnswer = await pcClient.createAnswer();
      await pcClient.setLocalDescription(clientAnswer);
      await gatherIce(pcClient);
      ws.send(JSON.stringify(pcClient.localDescription));

      // Create Meta offer with ICE candidates
      pcMeta.addTransceiver("audio", { direction: "recvonly" });
      const metaOffer = await pcMeta.createOffer();
      await pcMeta.setLocalDescription(metaOffer);
      const metaCandidates = await gatherIce(pcMeta);

      // 🔧 Replace 0.0.0.0 with public IP in SDP
      const finalizedSDP = finalizeSDP(pcMeta.localDescription.sdp, metaCandidates);

      // ✅ Payload to Meta
      const metaPayload = {
        AgentChatEventType: "call",
        businessId: "564cbdc4a1c848f5951f0930e4e9aced",
        FromPhoneId: "645598385313872",
        ToNumber: "919986014713",
        sdpType: pcMeta.localDescription?.type,
        sdp: finalizedSDP,
        callEvent: "connect",
      };

      console.log("📤 Sending finalized offer to Meta WebSocket:", metaPayload);
      activeMetaSocket?.send(JSON.stringify(metaPayload));
    }
  });

  ws.on("close", () => {
    pcClient.close();
    pcMeta.close();
    console.log("❌ Browser disconnected, PeerConnections closed");
  });
});

// ✅ Upgrade handling
server.on("upgrade", (req, socket, head) => {
  if (req.url === "/meta") {
    metaWss.handleUpgrade(req, socket, head, (ws) => metaWss.emit("connection", ws, req));
  } else {
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit("connection", ws, req));
  }
});

// Start HTTP server
const PORT = process.env.PORT || 8080;
server.listen(PORT, () => {
  console.log(`✅ WebRTC relay server running on port ${PORT}`);
});
