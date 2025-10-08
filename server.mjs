import http from "http";
import { WebSocketServer } from "ws";
import { RTCPeerConnection } from "werift";
import Prism from "prism-media";
import { Writer as WavWriter } from "wav";
import fs from "fs";

// ----------------- SERVER -----------------
const server = http.createServer();
const wss = new WebSocketServer({ noServer: true });   // Browser
const metaWss = new WebSocketServer({ noServer: true }); // Meta

let activeBrowserWs = null;
let activeMetaWs = null;
let activeBrowserPC = null;
let activeMetaPC = null;

// ----------------- HELPER: Finalize SDP -----------------
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

// ----------------- HELPER: Create PC -----------------
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


// ----------------- META WS -----------------
metaWss.on("connection", async (ws) => {
  console.log("🔗 Meta connected");
  activeMetaWs = ws;

  const { pc, candidates } = await createPC("sendrecv");
  activeMetaPC = pc;

  // Forward audio tracks from Meta → Browser
  pc.onTrack.subscribe(track => {
    if (track.kind === "audio" && activeBrowserPC) {
      console.log("🎧 Meta audio track received, forwarding to Browser");
      activeBrowserPC.addTrack(track);
       track.onReceiveRtp.subscribe((rtp) => {
        console.log("📥 RTP from meta:", rtp.header.timestamp);
        // opusStream.write(rtp.payload);
      });
    }
  });

  ws.on("message", async (msg) => {
    const data = JSON.parse(msg.toString());

    if (data.type === "offer") {
      // Meta sends an offer → answer
      await pc.setRemoteDescription({ type: "offer", sdp: data.sdp });
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      const finalSDP = finalizeSDP(pc, candidates);
      ws.send(JSON.stringify({ type: "answer", sdp: finalSDP }));
    }
    else if (data.sdpType === "answer") {
      // Browser previously sent offer → set remote
      console.log(activeMetaPC, data, "data inside that")
      if (activeMetaPC) {
          console.log(data, "data inside22e that")
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

  const { pc, candidates } = await createPC("sendrecv");
  activeBrowserPC = pc;

  // Forward audio tracks from Browser → Meta
  pc.onTrack.subscribe((track) => {
    if (track.kind === "audio" && activeMetaPC) {
      console.log("🎤 Browser track received, forwarding to Meta");
      activeMetaPC.addTrack(track);

      // // Optional: save audio
      // const opusStream = new Prism.opus.Decoder({ frameSize: 960, channels: 1, rate: 48000 });
      // const wavWriter = new WavWriter({ sampleRate: 48000, channels: 1, bitDepth: 16 });
      // const output = fs.createWriteStream("browser_audio.wav");
      // opusStream.pipe(wavWriter).pipe(output);

      track.onReceiveRtp.subscribe((rtp) => {
        // console.log("📥 RTP from Browser:", rtp.header.timestamp);
        // opusStream.write(rtp.payload);
      });
    }
  })

  ws.on("message", async (msg) => {
    const data = JSON.parse(msg.toString());

    if (data.type === "offer") {
      await pc.setRemoteDescription({ type: "offer", sdp: data.sdp });
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      const finalSDP = finalizeSDP(pc, candidates);
      ws.send(JSON.stringify({ type: "answer", sdp: finalSDP }));

      // Relay to Meta using the existing PC
      if (activeMetaWs && activeMetaPC) {
        const offer = await activeMetaPC.createOffer();
        await activeMetaPC.setLocalDescription(offer);
        const metaSDP = finalizeSDP(activeMetaPC, []); // candidates already gathered
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

const PORT = process.env.PORT || 8080;
server.listen(PORT, () => console.log(`✅ Server running on http://localhost:${PORT}`));
