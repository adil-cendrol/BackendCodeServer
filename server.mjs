import http from "http";
import { WebSocketServer } from "ws";
import WebSocket from "ws"; // for Meta connection
import { RTCPeerConnection } from "werift";
import Prism from "prism-media";
import { Writer as WavWriter } from "wav";
import fs from "fs";
import dotenv from "dotenv";

dotenv.config();

// ✅ Create HTTP server (Render requires this)
const PORT = process.env.PORT || 8080;
const server = http.createServer();

// ✅ Attach WebSocket server
const wss = new WebSocketServer({ server });
server.listen(PORT, () => {
  console.log(`✅ WebSocket server running on port ${PORT}`);
});

// ✅ Meta WebSocket connection
const META_WS_URL = process.env.META_WS_URL;
const metaWs = new WebSocket(META_WS_URL);

metaWs.on("open", () => console.log("✅ Connected to Meta WebSocket"));

metaWs.on("message", async (message) => {
  const data = JSON.parse(message.toString());
  console.log("📩 From Meta:", data);

  if (data.type === "answer" && global.pcMeta) {
    await global.pcMeta.setRemoteDescription({ type: "answer", sdp: data.sdp });
  }

  if (data.type === "offer" && global.pcMeta) {
    await global.pcMeta.setRemoteDescription({ type: "offer", sdp: data.sdp });
    const answer = await global.pcMeta.createAnswer();
    await global.pcMeta.setLocalDescription(answer);

    const answerPayload = {
      AgentChatEventType: "call",
      businessId: "",
      FromPhoneId: "",
      ToNumber: "",
      sdpType: answer.type,
      sdp: answer.sdp,
      callEvent: "connect",
    };

    console.log("📤 Sending answer to Meta:", answerPayload);
    metaWs.send(JSON.stringify(answerPayload));
  }
});

// ✅ Handle new browser WebSocket connections
wss.on("connection", async (ws) => {
  console.log("📡 New browser connected");

  const pcClient = new RTCPeerConnection({
    iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
  });

  const pcMeta = new RTCPeerConnection({
    iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
  });

  global.pcMeta = pcMeta; // so Meta message handler can access it

  // 🎙️ Browser → Meta audio forward
  pcClient.onTrack.subscribe((track) => {
    if (track.kind === "audio") {
      pcMeta.addTrack(track);

      const opusStream = new Prism.opus.Decoder({ frameSize: 960, channels: 1, rate: 48000 });
      const wavWriter = new WavWriter({ sampleRate: 48000, channels: 1, bitDepth: 16 });
      const outputFile = fs.createWriteStream("call_record.wav");

      opusStream.pipe(wavWriter).pipe(outputFile);

      track.onReceiveRtp.subscribe((rtp) => opusStream.write(rtp.payload));
    }
  });

  // 🎧 Meta → Browser audio forward
  pcMeta.onTrack.subscribe((track) => {
    if (track.kind === "audio") {
      pcClient.addTrack(track);
    }
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

      // Create offer for Meta
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

      console.log("📤 Sending Meta offer:", metaPayload);
      metaWs.send(JSON.stringify(metaPayload));
    }
  });

  ws.on("close", () => {
    pcClient.close();
    pcMeta.close();
    console.log("❌ Browser disconnected, closing PeerConnections");
  });
});
