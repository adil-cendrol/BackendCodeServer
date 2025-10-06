
// import { WebSocketServer } from "ws";
// import WebSocket from "ws"; // For connecting to Meta
// import { RTCPeerConnection } from "werift";
// import Prism from "prism-media";
// // const { OpusDecoder } = Prism;   // destructure OpusDecoder
// import { Writer as WavWriter } from "wav";

// import fs from "fs";


// // ----------------------
// // 1️⃣ Browser WebSocket Server
// const wss = new WebSocketServer({ port: 8080 });
// console.log("✅ Browser WebSocket Server running on ws://localhost:8080");
// const outputFile = fs.createWriteStream("call_record.wav");

// // ----------------------
// // 2️⃣ Meta WebSocket Client
// const META_WS_URL = "wss://464lquf5o3.execute-api.ap-south-1.amazonaws.com/production?auth_token=eyJraWQiOiJIWFpUZWlNRWRSeHl4dWtTbUt1MXNTSm9xd1FRSXl6R1NQd3hWNlZQRHZrPSIsImFsZyI6IlJTMjU2In0.eyJzdWIiOiJlYzkzOWQ2MC05ZjUwLTQ5MmEtODBiZC01MDY1MzNhMzVhYjIiLCJpc3MiOiJodHRwczpcL1wvY29nbml0by1pZHAuYXAtc291dGgtMS5hbWF6b25hd3MuY29tXC9hcC1zb3V0aC0xX1JBa256a3FXRCIsImNsaWVudF9pZCI6IjdiNjI2NTByMWJra2g0N2dwajgzcWdwNWQ0Iiwib3JpZ2luX2p0aSI6ImFmMDhkZDQwLWQyNGItNGIxYi1hODQ1LWU0NGFhZGU5ZjY4NSIsImV2ZW50X2lkIjoiNTQzZDhhNmItYmUwMy00MmNiLWJlYzktZTc1M2FlNTY1YmViIiwidG9rZW5fdXNlIjoiYWNjZXNzIiwic2NvcGUiOiJhd3MuY29nbml0by5zaWduaW4udXNlci5hZG1pbiIsImF1dGhfdGltZSI6MTc1OTU2ODc3MiwiZXhwIjoxNzU5NjU1MTcyLCJpYXQiOjE3NTk1Njg3NzIsImp0aSI6ImE5NzQwNWRjLWVhNzYtNDMxZi1iMmQxLTcyNTlmYmQ5ZmEyMCIsInVzZXJuYW1lIjoiZWM5MzlkNjAtOWY1MC00OTJhLTgwYmQtNTA2NTMzYTM1YWIyIn0.pn5qco6xTDz-T4Zf0VWY7kvxZXoE--2cLAhgtbDFiXOUWl4QZgf6AyI9IohkO0copK41-u5uEuAvcgEalI3s5-gu8Vb17w-B2Ee1NJ2am5xueZLC6SB047bw2WEq6hAwb8whEoi74mfE6wrRtv-9s0II4xQtpgJvpUGcuzxcEIb0263g_i1WwpEALb-DdEtv9OeSFDvxfmzpCdWMd-5wMObgZKk07vQa2NeIIQiMJK2Qz5HA0QYfRxEwOgUr3tcl5xATPDL9-fRWOb9LyWUFNyiyduRS1VEFEhi7fjZe0_tdRvuxZT_OJkBrTh9-_a26BVA2LBH9WHhtegt5LCpKxw";


// const metaWs = new WebSocket(META_WS_URL);
// metaWs.on("open", () => {
//   console.log("✅ Connected to Meta WebSocket");
// });


// metaWs.on("connection", (ws) => {
//   console.log("📡 New connection to Meta WS");

//   metaWs.on("message", async (message) => {
//     const data = JSON.parse(message.toString());
//     console.log(data, "sinde from meta side our go backend")
//     if (data.type === "answer") {
//       console.log("📩 Meta answer SDP received");
//       if (pcMeta) await pcMeta.setRemoteDescription({ type: "answer", sdp: data.sdp });
//     }
//     // handle incoming calls from Meta
//     // if (data.type === "offer") {
//     //   console.log("📩 Meta offer received");
//     //   if (pcMeta) {
//     //     await pcMeta.setRemoteDescription({ type: "offer", sdp: data.sdp });
//     //     const answer = await pcMeta.createAnswer();
//     //     await pcMeta.setLocalDescription(answer);
//     //     metaWs.send(JSON.stringify(pcMeta.localDescription));
//     //   }
//     // }
//     if (data.type === "offer") {
//       console.log("📩 Meta offer received");

//       if (pcMeta) {
//         await pcMeta.setRemoteDescription({ type: "offer", sdp: data.sdp });
//         const answer = await pcMeta.createAnswer();
//         await pcMeta.setLocalDescription(answer);

//         // Prepare payload in the format Meta expects
//         const answerPayload = {
//           AgentChatEventType: 'call',
//           businessId: '',
//           FromPhoneId: '',
//           ToNumber: '', // use sender number if provided
//           sdpType: pcMeta.localDescription.type,
//           sdp: pcMeta.localDescription.sdp,
//           callEvent: 'connect',
//         };

//         console.log(answerPayload, "sending answer to Meta");
//         metaWs.send(JSON.stringify(answerPayload));
//       }
//     }
//   });
// });

// // ----------------------
// // Handle new Browser connections
// wss.on("connection", async (ws) => {
//   const pcClient = new RTCPeerConnection({
//     iceServers: [{ urls: "stun:stun.l.google.com:19302" }]
//   }); // Browser side
//   const pcMeta = new RTCPeerConnection({
//     iceServers: [{ urls: "stun:stun.l.google.com:19302" }]
//   });  // Meta side

//   console.log("📡 New browser connected");

//   // ------------------------

//   // pcClient.onTrack.subscribe((track) => {
//   //   if (track.kind === "audio") {
//   //     pcMeta.addTrack(track);
//   //     track.onReceiveRtp.subscribe(rtp => {
//   //       // rtp.payload is the Opus data
//   //       const pcm = decoder.decode(rtp.payload);
//   //       outputFile.write(pcm);
//   //       console.log("📥 RTP from Browser:", rtp.header.timestamp)
//   //     });
//   //   }
//   // });
//   // Forward audio: Browser -> Meta
//   pcClient.onTrack.subscribe((track) => {
//     if (track.kind === "audio") {
//       pcMeta.addTrack(track);

//       const opusStream = new Prism.opus.Decoder({ frameSize: 960, channels: 1, rate: 48000 });
//       const wavWriter = new WavWriter({ sampleRate: 48000, channels: 1, bitDepth: 16 });
//       const outputFile = fs.createWriteStream("call_record.wav");

//       opusStream.pipe(wavWriter).pipe(outputFile);

//       track.onReceiveRtp.subscribe(rtp => {
//         opusStream.write(rtp.payload);
//       });
//     }
//   });


//   // Forward audio: Meta -> Browser
//   pcMeta.onTrack.subscribe((track) => {
//     if (track.kind === "audio") {
//       pcClient.addTrack(track);
//       track.onReceiveRtp.subscribe(rtp => console.log("📥 RTP from Meta:", rtp.header.timestamp));
//     }
//   });

//   // ------------------------
//   // Browser sends offer SDP
//   ws.on("message", async (message) => {
//     const { type, sdp } = JSON.parse(message);

//     if (type === "offer") {
//       // Browser offer -> pcClient
//       await pcClient.setRemoteDescription({ type, sdp });
//       pcClient.addTransceiver("audio", { direction: "recvonly" });
//       const clientAnswer = await pcClient.createAnswer();
//       await pcClient.setLocalDescription(clientAnswer);
//       console.log(clientAnswer, "client anser adil")
//       ws.send(JSON.stringify(pcClient.localDescription));

//       // pcMeta offer -> send to Meta via WebSocket
//       pcMeta.addTransceiver("audio", { direction: "recvonly" });
//       const metaOffer = await pcMeta.createOffer();
//       console.log(metaOffer, "meta oofer")
//       await pcMeta.setLocalDescription(metaOffer);
//       const answerPayload = {
//         AgentChatEventType: 'call',
//         businessId: 363906680148599,
//         FromPhoneId: 385840701287764,
//         ToNumber: 919625534956,
//         sdpType: pcMeta.localDescription.type,
//         sdp: pcMeta.localDescription.sdp,
//         callEvent: 'connect',
//       };
//       metaWs.on("connection", (metaClient) => {
//         console.log(answerPayload, "answer payload")
//         metaClient.send(JSON.stringify(answerPayload));
//       });
//     }
//   });

//   ws.on("close", () => {
//     pcClient.close();
//     pcMeta.close();
//     console.log("❌ Browser disconnected, closing PeerConnections");
//   });
// });



import { WebSocketServer } from "ws";
import WebSocket from "ws";
import { RTCPeerConnection } from "werift";
import Prism from "prism-media";
import { Writer as WavWriter } from "wav";
import fs from "fs";
import AudioMixer from "audio-mixer";

// ----------------------
// 1️⃣ WebSocket Server
const wss = new WebSocketServer({ port: 8080 });
console.log("✅ Browser WebSocket Server running on ws://localhost:8080");

// ----------------------
// 2️⃣ Meta WebSocket Client
const META_WS_URL = "wss://464lquf5o3.execute-api.ap-south-1.amazonaws.com/production?auth_token=eyJraWQiOiJIWFpUZWlNRWRSeHl4dWtTbUt1MXNTSm9xd1FRSXl6R1NQd3hWNlZQRHZrPSIsImFsZyI6IlJTMjU2In0.eyJzdWIiOiJlYzkzOWQ2MC05ZjUwLTQ5MmEtODBiZC01MDY1MzNhMzVhYjIiLCJpc3MiOiJodHRwczpcL1wvY29nbml0by1pZHAuYXAtc291dGgtMS5hbWF6b25hd3MuY29tXC9hcC1zb3V0aC0xX1JBa256a3FXRCIsImNsaWVudF9pZCI6IjdiNjI2NTByMWJra2g0N2dwajgzcWdwNWQ0Iiwib3JpZ2luX2p0aSI6ImFmMDhkZDQwLWQyNGItNGIxYi1hODQ1LWU0NGFhZGU5ZjY4NSIsImV2ZW50X2lkIjoiNTQzZDhhNmItYmUwMy00MmNiLWJlYzktZTc1M2FlNTY1YmViIiwidG9rZW5fdXNlIjoiYWNjZXNzIiwic2NvcGUiOiJhd3MuY29nbml0by5zaWduaW4udXNlci5hZG1pbiIsImF1dGhfdGltZSI6MTc1OTU2ODc3MiwiZXhwIjoxNzU5NjU1MTcyLCJpYXQiOjE3NTk1Njg3NzIsImp0aSI6ImE5NzQwNWRjLWVhNzYtNDMxZi1iMmQxLTcyNTlmYmQ5ZmEyMCIsInVzZXJuYW1lIjoiZWM5MzlkNjAtOWY1MC00OTJhLTgwYmQtNTA2NTMzYTM1YWIyIn0.pn5qco6xTDz-T4Zf0VWY7kvxZXoE--2cLAhgtbDFiXOUWl4QZgf6AyI9IohkO0copK41-u5uEuAvcgEalI3s5-gu8Vb17w-B2Ee1NJ2am5xueZLC6SB047bw2WEq6hAwb8whEoi74mfE6wrRtv-9s0II4xQtpgJvpUGcuzxcEIb0263g_i1WwpEALb-DdEtv9OeSFDvxfmzpCdWMd-5wMObgZKk07vQa2NeIIQiMJK2Qz5HA0QYfRxEwOgUr3tcl5xATPDL9-fRWOb9LyWUFNyiyduRS1VEFEhi7fjZe0_tdRvuxZT_OJkBrTh9-_a26BVA2LBH9WHhtegt5LCpKxw";
const metaWs = new WebSocket(META_WS_URL);

// ----------------------
// 3️⃣ Create Mixer and Output
const mixer = new AudioMixer.Mixer({
  channels: 1,
  bitDepth: 16,
  sampleRate: 48000,
  clearInterval: 250
});

const outputFile = fs.createWriteStream("mixed_call.wav");
const wavWriter = new WavWriter({ sampleRate: 48000, channels: 1, bitDepth: 16 });
mixer.pipe(wavWriter).pipe(outputFile);

// ----------------------
// 4️⃣ Handle Browser Connections
wss.on("connection", async (ws) => {
  const pcClient = new RTCPeerConnection();
  const pcMeta = new RTCPeerConnection();

  console.log("📡 New browser connected");

  // --- Handle Browser -> Meta audio ---
  pcClient.onTrack.subscribe((track) => {
    if (track.kind === "audio") {
      pcMeta.addTrack(track);

      const browserDecoder = new Prism.opus.Decoder({ frameSize: 960, channels: 1, rate: 48000 });
      const browserInput = new AudioMixer.Input({
        channels: 1,
        bitDepth: 16,
        sampleRate: 48000,
        volume: 100
      });

      browserDecoder.pipe(browserInput);
      mixer.addInput(browserInput);

      track.onReceiveRtp.subscribe((rtp) => {
        browserDecoder.write(rtp.payload);
      });
    }
  });

  // --- Handle Meta -> Browser audio ---
  pcMeta.onTrack.subscribe((track) => {
    if (track.kind === "audio") {
      pcClient.addTrack(track);

      const metaDecoder = new Prism.opus.Decoder({ frameSize: 960, channels: 1, rate: 48000 });
      const metaInput = new AudioMixer.Input({
        channels: 1,
        bitDepth: 16,
        sampleRate: 48000,
        volume: 100
      });

      metaDecoder.pipe(metaInput);
      mixer.addInput(metaInput);

      track.onReceiveRtp.subscribe((rtp) => {
        metaDecoder.write(rtp.payload);
      });
    }
  });

  // --- Handle Offer from Browser ---
  ws.on("message", async (message) => {
    const { type, sdp } = JSON.parse(message);
    if (type === "offer") {
      await pcClient.setRemoteDescription({ type, sdp });
      pcClient.addTransceiver("audio", { direction: "recvonly" });

      const answer = await pcClient.createAnswer();
      await pcClient.setLocalDescription(answer);
      ws.send(JSON.stringify(pcClient.localDescription));

      // Create offer for Meta
      pcMeta.addTransceiver("audio", { direction: "recvonly" });
      const metaOffer = await pcMeta.createOffer();
      await pcMeta.setLocalDescription(metaOffer);

      // Send offer to Meta (through your Meta socket)
      metaWs.send(
        JSON.stringify({
          AgentChatEventType: "call",
          businessId: 363906680148599,
          FromPhoneId: 385840701287764,
          ToNumber: 919625534956,
          sdpType: pcMeta.localDescription.type,
          sdp: pcMeta.localDescription.sdp,
          callEvent: "connect",
        })
      );
    }
  });

  ws.on("close", () => {
    pcClient.close();
    pcMeta.close();
    console.log("❌ Browser disconnected");
  });
});
