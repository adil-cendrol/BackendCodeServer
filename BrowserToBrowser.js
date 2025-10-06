
import { WebSocketServer } from "ws";
import { RTCPeerConnection } from "werift";
import Prism from "prism-media";
import { Writer as WavWriter } from "wav";
import fs from "fs";

// ----------------------
// Browser WS Server
const wss = new WebSocketServer({ port: 8080 });
console.log("✅ Browser WebSocket Server running on ws://localhost:8080");

// ----------------------
// Meta WS Server
const metaWs = new WebSocketServer({ port: 8082 });
console.log("✅ Meta WebSocket Server running on ws://localhost:8082");

const metaClients = []; // store connected Meta clients

metaWs.on("connection", (ws) => {
  console.log("📡 New connection to Meta WS");
  metaClients.push(ws);

  ws.on("message", async (message) => {
    const data = JSON.parse(message.toString());
    console.log("Received from Meta client:", data);

    // Handle answer from Meta client for this browser session
    if (data.sdpType === "answer" && data.callId) {
      const browserSession = browserSessions[data.callId];
      if (browserSession && browserSession.pcMeta) {
        console.log("📩 Meta answer SDP received for browser session");
        await browserSession.pcMeta.setRemoteDescription({
          type: "answer",
          sdp: data.sdp,
        });
      }
    }
  });

  ws.on("close", () => {
    const index = metaClients.indexOf(ws);
    if (index > -1) metaClients.splice(index, 1);
    console.log("❌ Meta client disconnected");
  });
});

// ----------------------
// Store browser sessions to map answers from Meta
const browserSessions = {};

wss.on("connection", async (ws) => {
  console.log("📡 New browser connected");

  const pcClient = new RTCPeerConnection({ iceServers: [{ urls: "stun:stun.l.google.com:19302" }] });
  const pcMeta = new RTCPeerConnection({ iceServers: [{ urls: "stun:stun.l.google.com:19302" }] });

  const callId = Date.now().toString(); // unique ID for this session
  browserSessions[callId] = { pcMeta };

  // ----------------------
  // Forward audio: Browser -> Meta
  pcClient.onTrack.subscribe((track) => {
    if (track.kind === "audio") {
      pcMeta.addTrack(track);

      const opusStream = new Prism.opus.Decoder({ frameSize: 960, channels: 1, rate: 48000 });
      const wavWriter = new WavWriter({ sampleRate: 48000, channels: 1, bitDepth: 16 });
      const outputFile = fs.createWriteStream("call_record.wav");

      opusStream.pipe(wavWriter).pipe(outputFile);

      track.onReceiveRtp.subscribe((rtp) => {
          console.log("📥 RTP from browser:", rtp.header.timestamp)
        opusStream.write(rtp.payload);
      });
    }
  });

  // Forward audio: Meta -> Browser
  pcMeta.onTrack.subscribe((track) => {
    if (track.kind === "audio") {
      pcClient.addTrack(track);
      track.onReceiveRtp.subscribe((rtp) =>
        console.log("📥 RTP from Meta:", rtp.header.timestamp)
      );
    }
  });

  // ----------------------
  ws.on("message", async (message) => {
    const { type, sdp } = JSON.parse(message);

    if (type === "offer") {
      // Browser offer -> pcClient
      await pcClient.setRemoteDescription({ type, sdp });
      pcClient.addTransceiver("audio", { direction: "recvonly" });
      const clientAnswer = await pcClient.createAnswer();
      await pcClient.setLocalDescription(clientAnswer);
      ws.send(JSON.stringify(pcClient.localDescription));
      console.log("✅ Sent client answer back to browser");

      // pcMeta offer -> send to Meta WS clients
      pcMeta.addTransceiver("audio", { direction: "recvonly" });
      const metaOffer = await pcMeta.createOffer();
      await pcMeta.setLocalDescription(metaOffer);

      const offerPayload = {
        AgentChatEventType: "call",
        businessId: 363906680148599,
        FromPhoneId: 385840701287764,
        ToNumber: 919625534956,
        sdpType: pcMeta.localDescription.type,
        sdp: pcMeta.localDescription.sdp,
        callEvent: "connect",
        callId, // send callId so Meta can respond
      };

      console.log("📤 Sending offer to all Meta clients:", offerPayload);

      metaClients.forEach((client) => {
        if (client.readyState === client.OPEN) {
          client.send(JSON.stringify(offerPayload));
        }
      });
    }
  });

  ws.on("close", () => {
    pcClient.close();
    pcMeta.close();
    delete browserSessions[callId];
    console.log("❌ Browser disconnected, closing PeerConnections");
  });
});
