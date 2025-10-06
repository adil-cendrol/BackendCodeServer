
import { WebSocketServer } from "ws";
import WebSocket from "ws"; // For connecting to Meta
import { RTCPeerConnection } from "werift";
import Prism from "prism-media";
// const { OpusDecoder } = Prism;   // destructure OpusDecoder
import { Writer as WavWriter } from "wav";

import fs from "fs";
import dotenv from "dotenv";
dotenv.config();


// ----------------------
// 1️⃣ Browser WebSocket Server
import http from "http";
import { WebSocketServer } from "ws";

// Render provides a PORT automatically
const PORT = process.env.PORT || 8080;

// Create an HTTP server (Render requires one)
const server = http.createServer();

// Attach WebSocket server to HTTP server
const wss = new WebSocketServer({ server });


console.log("✅ Browser WebSocket Server running on ws://localhost:8080");
const outputFile = fs.createWriteStream("call_record.wav");

// ----------------------
// 2️⃣ Meta WebSocket Client
const META_WS_URL = process.env.META_WS_URL;


const metaWs = new WebSocket(META_WS_URL);
metaWs.on("open", () => {
  console.log("✅ Connected to Meta WebSocket");
});


metaWs.on("connection", (ws) => {
  console.log("📡 New connection to Meta WS");

});

metaWs.on("message", async (message) => {
  // console.log(message, "message i sid2")
  const data = JSON.parse(message.toString());
  console.log(data, "sinde from meta side our go backend")
  if (data.type === "answer") {
    console.log("📩 Meta answer SDP received");
    if (pcMeta) await pcMeta.setRemoteDescription({ type: "answer", sdp: data.sdp });
  }

  if (data.type === "offer") {
    console.log("📩 Meta offer received");

    if (pcMeta) {
      await pcMeta.setRemoteDescription({ type: "offer", sdp: data.sdp });
      const answer = await pcMeta.createAnswer();
      await pcMeta.setLocalDescription(answer);

      // Prepare payload in the format Meta expects
      const answerPayload = {
        AgentChatEventType: 'call',
        businessId: '',
        FromPhoneId: '',
        ToNumber: '', // use sender number if provided
        sdpType: pcMeta.localDescription.type,
        sdp: pcMeta.localDescription.sdp,
        callEvent: 'connect',
      };

      console.log(answerPayload, "sending answer to Meta");
      metaWs.send(JSON.stringify(answerPayload));
    }
  }
});
// ----------------------
// Handle new Browser connections
wss.on("connection", async (ws) => {
  const pcClient = new RTCPeerConnection({
    iceServers: [{ urls: "stun:stun.l.google.com:19302" }]
  }); // Browser side
  const pcMeta = new RTCPeerConnection({
    iceServers: [{ urls: "stun:stun.l.google.com:19302" }]
  });  // Meta side

  console.log("📡 New browser connected");

  pcClient.onTrack.subscribe((track) => {
    if (track.kind === "audio") {
      pcMeta.addTrack(track);

      const opusStream = new Prism.opus.Decoder({ frameSize: 960, channels: 1, rate: 48000 });
      const wavWriter = new WavWriter({ sampleRate: 48000, channels: 1, bitDepth: 16 });
      const outputFile = fs.createWriteStream("call_record.wav");

      opusStream.pipe(wavWriter).pipe(outputFile);

      track.onReceiveRtp.subscribe(rtp => {
        opusStream.write(rtp.payload);
      });
    }
  });


  // Forward audio: Meta -> Browser
  pcMeta.onTrack.subscribe((track) => {
    if (track.kind === "audio") {
      pcClient.addTrack(track);
      track.onReceiveRtp.subscribe(rtp => console.log("📥 RTP from Meta:", rtp.header.timestamp));
    }
  });

  // ------------------------
  // Browser sends offer SDP
  ws.on("message", async (message) => {

    const { type, sdp } = JSON.parse(message);

    if (type === "offer") {
      // Browser offer -> pcClient
      await pcClient.setRemoteDescription({ type, sdp });
      pcClient.addTransceiver("audio", { direction: "recvonly" });
      const clientAnswer = await pcClient.createAnswer();
      await pcClient.setLocalDescription(clientAnswer);
      console.log(clientAnswer, "client anser adil")
      ws.send(JSON.stringify(pcClient.localDescription));

      // pcMeta offer -> send to Meta via WebSocket
      pcMeta.addTransceiver("audio", { direction: "recvonly" });
      const metaOffer = await pcMeta.createOffer();
      console.log(metaOffer, "meta oofer")
      await pcMeta.setLocalDescription(metaOffer);
      const answerPayload = {
        AgentChatEventType: 'call',
        businessId: 363906680148599,
        FromPhoneId: 385840701287764,
        ToNumber: 919625534956,
        sdpType: pcMeta.localDescription.type,
        sdp: pcMeta.localDescription.sdp,
        callEvent: 'connect',
      };
      console.log(answerPayload, "answer payload")
      metaWs.send(JSON.stringify(answerPayload));

    }
  });

  ws.on("close", () => {
    pcClient.close();
    pcMeta.close();
    console.log("❌ Browser disconnected, closing PeerConnections");
  });
});

// Start listening
server.listen(PORT, () => {
  console.log(`✅ WebSocket server running on port ${PORT}`);
});

