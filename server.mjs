import http from "http";
import { WebSocketServer } from "ws";
import { RTCPeerConnection } from "werift";
import Prism from "prism-media";
import { Writer as WavWriter } from "wav";
import fs from "fs";

const server = http.createServer();
const wss = new WebSocketServer({ noServer: true });   // Browser
const metaWss = new WebSocketServer({ noServer: true }); // Meta

let activeBrowserWs = null;
let activeMetaWs = null;
let activeBrowserPC = null;
let activeMetaPC = null;

let browserStream = null;
let metaStream = null;

// ----------------- Helper: Finalize SDP -----------------
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

async function createPC(direction = "sendrecv") {
  const pc = new RTCPeerConnection({
    iceServers: [{ urls: "stun:stun.l.google.com:19302" }]
  });
  pc.addTransceiver("audio", { direction });

  const candidates = [];
  pc.onicecandidate = (event) => {
    if (event.candidate) candidates.push(event.candidate);
  };
  return { pc, candidates };
}

// ----------------- Audio Mixing + Recording -----------------
let opusBrowser, opusMeta, wavWriter;
let isRecordingStarted = false;

function tryStartRecording() {
  if (isRecordingStarted || !browserStream || !metaStream) return;

  console.log("🎙️ Both audio streams ready, starting recording...");

  opusBrowser = new Prism.opus.Decoder({ frameSize: 960, channels: 1, rate: 48000 });
  opusMeta = new Prism.opus.Decoder({ frameSize: 960, channels: 1, rate: 48000 });

  wavWriter = new WavWriter({ sampleRate: 48000, channels: 1, bitDepth: 16 });
  const output = fs.createWriteStream(`mixed_audio_${Date.now()}.wav`);
  wavWriter.pipe(output);
  const browserBuffer = [];
  const metaBuffer = [];

  function mixAndWrite() {
    while (browserBuffer.length && metaBuffer.length) {
      const b = browserBuffer.shift();
      const m = metaBuffer.shift();
      const minLen = Math.min(b.length, m.length);
      const mixed = Buffer.alloc(minLen);

      for (let i = 0; i < minLen; i += 2) {
        const bSample = b.readInt16LE(i);
        const mSample = m.readInt16LE(i);
        let mixedSample = bSample + mSample;
        mixedSample = Math.max(-32768, Math.min(32767, mixedSample));
        mixed.writeInt16LE(mixedSample, i);
      }
      wavWriter.write(mixed);
    }
  }

  opusBrowser.on("data", (pcm) => {
    browserBuffer.push(pcm);
    mixAndWrite();
  });

  opusMeta.on("data", (pcm) => {
    metaBuffer.push(pcm);
    mixAndWrite();
  });

  isRecordingStarted = true;
  console.log("🔴 Recording started");
}

// ----------------- META WS -----------------
metaWss.on("connection", async (ws) => {
  console.log("🔗 Meta connected");
  activeMetaWs = ws;
  ws.on("close", () => {
    console.log("Meta disconnected");
    stopRecording();
  });

  const { pc, candidates } = await createPC("sendrecv");
  activeMetaPC = pc;

  pc.onTrack.subscribe(track => {
    if (track.kind === "audio" && activeBrowserPC) {
      console.log("🎧 Meta audio track received, forwarding to Browser");
      activeBrowserPC.addTrack(track);

      metaStream = track;
      tryStartRecording();

      track.onReceiveRtp.subscribe((rtp) => {
        if (opusMeta) opusMeta.write(rtp.payload);
      });
    }
  });

  ws.on("message", async (msg) => {
    const data = JSON.parse(msg.toString());

    if (data.sdpType === "offer") {
      await pc.setRemoteDescription({ type: "offer", sdp: data.sdp });
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      const finalSDP = finalizeSDP(pc, candidates);
      ws.send(JSON.stringify({ type: "answer", sdp: finalSDP }));
    }
    else if (data.sdpType === "answer") {
      console.log("answer sdp answer outside")
      if (activeMetaPC) {
        console.log("inside sdp answer packet" , data.sdp)
        await activeMetaPC.setRemoteDescription({ type: "answer", sdp: data.sdp });
      }
    }
    else if (data.type === "candidate") {
      await pc.addIceCandidate(data.candidate);
    }
  });
});

// ----------------- BROWSER WS -----------------
wss.on("connection", async (ws) => {
  console.log("📡 Browser connected");
  activeBrowserWs = ws;
  // Stop recording if Browser disconnects
  ws.on("close", () => {
    console.log("Browser disconnected");
    stopRecording();
  });
  const { pc, candidates } = await createPC("sendrecv");
  activeBrowserPC = pc;

  pc.onTrack.subscribe(track => {
    if (track.kind === "audio" && activeMetaPC) {
      console.log("🎤 Browser track received, forwarding to Meta");
      activeMetaPC.addTrack(track);

      browserStream = track;
      tryStartRecording();

      track.onReceiveRtp.subscribe((rtp) => {
        if (opusBrowser) opusBrowser.write(rtp.payload);
      });
    }
  });

  ws.on("message", async (msg) => {
    const data = JSON.parse(msg.toString());

    if (data.type === "offer") {
      await pc.setRemoteDescription({ type: "offer", sdp: data.sdp });
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      const finalSDP = finalizeSDP(pc, candidates);
      ws.send(JSON.stringify({ type: "answer", sdp: finalSDP }));

      // Relay to Meta
      if (activeMetaWs && activeMetaPC) {
        const offer = await activeMetaPC.createOffer();
        await activeMetaPC.setLocalDescription(offer);
        const metaSDP = finalizeSDP(activeMetaPC, candidates);
        activeMetaWs.send(JSON.stringify({ type: "offer", sdp: metaSDP }));
      }
    }
    else if (data.type === "answer") {
      if (activeBrowserPC) {
        await activeBrowserPC.setRemoteDescription({ type: "answer", sdp: data.sdp });
      }
    }
    else if (data.type === "candidate") {
      await pc.addIceCandidate(data.candidate);
    }
  });
});

// ----------------- HTTP Upgrade -----------------
server.on("upgrade", (req, socket, head) => {
  if (req.url === "/meta") {
    metaWss.handleUpgrade(req, socket, head, (ws) => metaWss.emit("connection", ws, req));
  } else {
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit("connection", ws, req));
  }
});
function stopRecording() {
  if (!isRecordingStarted) return;
  console.log("🛑 Stopping recording...");

  opusBrowser.end();
  opusMeta.end();
  wavWriter.end();

  isRecordingStarted = false;
  browserStream = null;
  metaStream = null;
}


const PORT = process.env.PORT || 8080;
server.listen(PORT, () => console.log(`✅ Server running on http://localhost:${PORT}`));
