"use client";

import { useEffect, useRef, useState } from "react";

type Screen = "welcome" | "camera" | "waiting" | "call";
type MatchResponse = { status: "waiting" | "matched" | "idle" | "left"; partnerId?: string; matchedAt?: number; matchId?: string };
type Signal =
  | { type: "offer"; sdp: RTCSessionDescriptionInit }
  | { type: "answer"; sdp: RTCSessionDescriptionInit }
  | { type: "ice"; candidate: RTCIceCandidateInit };

export default function Home() {
  const [screen, setScreen] = useState<Screen>("welcome");
  const [error, setError] = useState("");
  const [confirmedAdult, setConfirmedAdult] = useState(false);
  const [matchStatus, setMatchStatus] = useState<"idle" | "waiting" | "matched" | "error">("idle");
  const [isAdvancing, setIsAdvancing] = useState(false);
  const [partnerId, setPartnerId] = useState("");
  const [matchId, setMatchId] = useState("");
  const [reporting, setReporting] = useState(false);
  const [reportMessage, setReportMessage] = useState("");
  const [connectionStatus, setConnectionStatus] = useState("Connecting securely…");
  const sessionIdRef = useRef("");
  const videoRef = useRef<HTMLVideoElement>(null);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);

  useEffect(() => () => {
    peerConnectionRef.current?.close();
    localStreamRef.current?.getTracks().forEach((track) => track.stop());
    void leaveQueue();
  }, []);

  async function prepareCamera() {
    setError("");
    setScreen("camera");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user" },
        audio: true,
      });
      localStreamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;
    } catch {
      setError("Camera and microphone access is needed to start a chat.");
    }
  }

  async function enterQueue() {
    setScreen("waiting");
    setMatchStatus("waiting");
    const sessionId = sessionIdRef.current || crypto.randomUUID();
    sessionIdRef.current = sessionId;
    try {
      await moderation("/api/session", { sessionId, adultConfirmed: true });
      const response = await matcher("/match/join", sessionId);
      if (response.status === "matched") beginMatch(response);
    } catch { setMatchStatus("error"); }
  }

  async function leaveQueue() {
    const sessionId = sessionIdRef.current;
    if (!sessionId) return;
    try { await matcher("/match/leave", sessionId); } catch { /* best-effort cleanup */ }
    sessionIdRef.current = "";
  }

  function beginMatch(response: MatchResponse) {
    if (!response.partnerId) {
      setMatchStatus("error");
      return;
    }
    setPartnerId(response.partnerId);
    setMatchId(response.matchId || "");
    setMatchStatus("matched");
    setScreen("call");
  }

  async function endCall() {
    peerConnectionRef.current?.close();
    peerConnectionRef.current = null;
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
    await leaveQueue();
    localStreamRef.current?.getTracks().forEach((track) => track.stop());
    localStreamRef.current = null;
    setPartnerId("");
    setMatchId("");
    setMatchStatus("idle");
    setScreen("welcome");
  }

  async function nextPerson() {
    if (isAdvancing) return;
    setIsAdvancing(true);
    peerConnectionRef.current?.close();
    peerConnectionRef.current = null;
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
    await leaveQueue();
    setPartnerId("");
    setMatchId("");
    await enterQueue();
    setIsAdvancing(false);
  }

  useEffect(() => {
    if (screen !== "waiting" || matchStatus !== "waiting") return;
    const timer = window.setInterval(async () => {
      try {
        const response = await matcher("/match/status", sessionIdRef.current);
        if (response.status === "matched") beginMatch(response);
      } catch { setMatchStatus("error"); }
    }, 2000);
    return () => window.clearInterval(timer);
  }, [screen, matchStatus]);

  useEffect(() => {
    if (screen !== "call" || !partnerId || !localStreamRef.current) return;

    let cancelled = false;
    const sessionId = sessionIdRef.current;
    const stream = localStreamRef.current;
    const pendingCandidates: RTCIceCandidateInit[] = [];
    const peer = new RTCPeerConnection({
      iceServers: [{ urls: "stun:stun.cloudflare.com:3478" }],
    });
    peerConnectionRef.current = peer;
    if (localVideoRef.current) localVideoRef.current.srcObject = stream;
    stream.getTracks().forEach((track) => peer.addTrack(track, stream));

    const sendSignal = async (signal: Signal) => {
      try {
        await matcher("/match/signal/send", sessionId, partnerId, signal);
      } catch {
        if (!cancelled) setConnectionStatus("Connection signaling failed. Please try another match.");
      }
    };

    peer.onicecandidate = (event) => {
      if (event.candidate) void sendSignal({ type: "ice", candidate: event.candidate.toJSON() });
    };
    peer.ontrack = (event) => {
      if (remoteVideoRef.current) remoteVideoRef.current.srcObject = event.streams[0];
      setConnectionStatus("You are connected.");
    };
    peer.onconnectionstatechange = () => {
      if (cancelled) return;
      if (peer.connectionState === "connected") setConnectionStatus("You are connected.");
      if (peer.connectionState === "failed" || peer.connectionState === "disconnected") {
        setConnectionStatus("Connection lost. Try another match.");
      }
    };

    const addCandidate = async (candidate: RTCIceCandidateInit) => {
      if (!peer.remoteDescription) {
        pendingCandidates.push(candidate);
        return;
      }
      await peer.addIceCandidate(candidate);
    };

    const handleSignal = async (signal: Signal) => {
      if (signal.type === "ice") return addCandidate(signal.candidate);
      if (signal.type === "offer") {
        await peer.setRemoteDescription(signal.sdp);
        while (pendingCandidates.length) await peer.addIceCandidate(pendingCandidates.shift()!);
        const answer = await peer.createAnswer();
        await peer.setLocalDescription(answer);
        await sendSignal({ type: "answer", sdp: answer });
        return;
      }
      if (signal.type === "answer" && peer.signalingState === "have-local-offer") {
        await peer.setRemoteDescription(signal.sdp);
        while (pendingCandidates.length) await peer.addIceCandidate(pendingCandidates.shift()!);
      }
    };

    const pollSignals = async () => {
      try {
        const response = await matcher("/match/signal/poll", sessionId);
        if (response.status !== "matched") {
          if (!cancelled) setConnectionStatus("This match has ended.");
          return;
        }
        for (const signal of response.signals ?? []) await handleSignal(signal);
      } catch {
        if (!cancelled) setConnectionStatus("Connection signaling failed. Please try another match.");
      }
    };

    const start = async () => {
      try {
        // A deterministic offerer avoids offer collisions without exposing profile data.
        if (sessionId < partnerId) {
          const offer = await peer.createOffer();
          await peer.setLocalDescription(offer);
          await sendSignal({ type: "offer", sdp: offer });
        }
        await pollSignals();
      } catch {
        if (!cancelled) setConnectionStatus("Could not prepare this call. Try another match.");
      }
    };
    void start();
    const timer = window.setInterval(() => { void pollSignals(); }, 1000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
      peer.close();
      if (peerConnectionRef.current === peer) peerConnectionRef.current = null;
    };
  }, [screen, partnerId]);

  async function reportPartner(reasonCode: "sexual" | "nudity" | "harassment" | "solicitation" | "minor_concern" | "other") {
    if (!remoteVideoRef.current || !partnerId || !matchId || reporting) return;
    setReporting(true); setReportMessage("");
    try {
      const image = await captureFrame(remoteVideoRef.current);
      const intent = await moderation("/api/reports/upload-intent", { sessionId: sessionIdRef.current, partnerId, matchId });
      await fetch(`${MODERATION_ORIGIN}${intent.uploadUrl}`, { method: "PUT", credentials: "include", headers: { "content-type": "image/webp", "content-length": String(image.size) }, body: image });
      const result = await moderation("/api/reports", { sessionId: sessionIdRef.current, partnerId, matchId, uploadId: intent.uploadId, reasonCode, capturedAt: new Date().toISOString() });
      setReportMessage(result.suspended ? "Report received. This account was suspended." : "Report received. Thank you for helping keep RandomCam safe.");
      setTimeout(() => { void endCall(); }, 1200);
    } catch { setReportMessage("We could not send that report. Please leave this chat and try again if you feel unsafe."); }
    finally { setReporting(false); }
  }

  return (
    <main>
      <header className="topbar">
        <a className="brand" href="#top" aria-label="RandomCam home">
          <span className="brand-mark">R</span>
          <span>randomcam</span>
        </a>
        <div className="header-note"><span className="live-dot" /> Adults only · 18+</div>
      </header>

      {screen === "welcome" && (
        <section className="hero hero--welcome" id="top">
          <div className="hero-copy">
            <p className="eyebrow">RANDOM VIDEO CHAT · 18+</p>
            <h1>Talk to someone new.</h1>
            <p className="intro">Start a private, one-to-one video conversation with someone from anywhere in the world.</p>
            <label className="age-check">
              <input type="checkbox" checked={confirmedAdult} onChange={(event) => setConfirmedAdult(event.target.checked)} />
              <span>I confirm that I am 18+ and I agree: RandomCam is for friendship, cultural exchange and language practice — not dating or sexual content.</span>
            </label>
            <button className="primary" onClick={prepareCamera} disabled={!confirmedAdult}>Start chatting <span>→</span></button>
            <p className="fine-print">Nudity, harassment and solicitation are prohibited. Report abuse in one tap.</p>
          </div>
        </section>
      )}

      {screen === "camera" && (
        <section className="call-stage">
          <div className="camera-panel">
            <video ref={videoRef} autoPlay muted playsInline />
            {!error && <div className="camera-caption">Check your camera, then enter the room.</div>}
            {error && <div className="camera-error">{error}</div>}
          </div>
          <div className="call-control">
            <p className="eyebrow">YOU&apos;RE ALMOST IN</p>
            <h2>Check your camera.</h2>
            <p>Your camera is only shared once you are matched.</p>
            <button className="primary" onClick={enterQueue} disabled={Boolean(error)}>Enter the room <span>→</span></button>
            <button className="text-button" onClick={() => setScreen("welcome")}>Not now</button>
          </div>
        </section>
      )}

      {screen === "waiting" && (
        <section className="waiting-stage">
          <div className="pulse" />
          <p className="eyebrow">{matchStatus === "matched" ? "MATCH FOUND" : "FINDING SOMEONE"}</p>
          <h2>{matchStatus === "matched" ? "Someone is ready to meet you." : "Looking for your next conversation."}</h2>
          <p className="intro">{matchStatus === "matched" ? "Your private video connection is being prepared." : matchStatus === "error" ? "We could not reach the matching room. Please try again." : "You are in the global waiting room. We will connect you with one random person."}</p>
          <button className="secondary" onClick={async () => { await leaveQueue(); setScreen("welcome"); setMatchStatus("idle"); }}>{matchStatus === "matched" ? "Leave match" : "Stop looking"}</button>
        </section>
      )}

      {screen === "call" && (
        <section className="call-stage active-call">
          <div className="remote-panel">
            <video ref={remoteVideoRef} autoPlay playsInline />
            <div className="camera-caption">{connectionStatus}</div>
          </div>
          <div className="call-control">
            <div className="local-preview"><video ref={localVideoRef} autoPlay muted playsInline /></div>
            <p className="eyebrow">PRIVATE 1:1 CALL</p>
            <h2>You&apos;re connected.</h2>
            <p>Use Next to meet someone else. Report only if this person is unsafe or breaks the rules.</p>
            <button className="next-button" onClick={nextPerson} disabled={isAdvancing}>{isAdvancing ? "Finding someone…" : <>Next person <span>→</span></>}</button>
            <div className="report-controls">
              <label htmlFor="report-reason">Unsafe or against the rules?</label>
              <select id="report-reason" defaultValue="harassment" disabled={reporting} onChange={(event) => { if (event.target.value) void reportPartner(event.target.value as "sexual" | "nudity" | "harassment" | "solicitation" | "minor_concern" | "other"); event.currentTarget.value = ""; }}>
                <option value="">Report this person…</option><option value="sexual">Sexual content</option><option value="nudity">Nudity</option><option value="harassment">Harassment</option><option value="solicitation">Solicitation</option><option value="minor_concern">May be under 18</option><option value="other">Other</option>
              </select>
              {reportMessage && <p className="report-message" role="status">{reportMessage}</p>}
            </div>
            <button className="text-button" onClick={endCall}>End chat</button>
          </div>
        </section>
      )}

      {screen === "welcome" && <section className="principles">
        <article><h3>Private by default</h3><p>No profile is needed to start a one-to-one conversation.</p></article>
        <article><h3>Respect first</h3><p>For friendship, culture and language only. Dating and sexual content are not allowed.</p></article>
      </section>}

      <footer><span>© 2026 RandomCam</span><span>18+ only · Community rules · Privacy</span></footer>
    </main>
  );
}

async function matcher(path: string, sessionId: string, partnerId?: string, signal?: Signal): Promise<MatchResponse & { signals?: Signal[] }> {
  const response = await fetch(`https://randomcam-matcher.kaz-creative-studio0.workers.dev${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ sessionId, partnerId, signal }),
  });
  if (!response.ok) throw new Error("matcher unavailable");
  return response.json();
}

const MODERATION_ORIGIN = "https://randomcam-moderation.kaz-creative-studio0.workers.dev";
type ModerationResponse = { uploadId?: string; uploadUrl?: string; suspended?: boolean };
async function moderation(path: string, body: Record<string, unknown>): Promise<ModerationResponse> {
  const response = await fetch(`${MODERATION_ORIGIN}${path}`, { method: "POST", credentials: "include", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  if (!response.ok) throw new Error("moderation unavailable");
  return response.json() as Promise<ModerationResponse>;
}

function captureFrame(video: HTMLVideoElement): Promise<Blob> {
  const width = Math.min(video.videoWidth || 640, 1280); const height = Math.round(width / ((video.videoWidth || 640) / (video.videoHeight || 480)));
  const canvas = document.createElement("canvas"); canvas.width = width; canvas.height = height;
  canvas.getContext("2d")?.drawImage(video, 0, 0, width, height);
  return new Promise((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("capture failed")), "image/webp", 0.8));
}
