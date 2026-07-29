"use client";

import { useRef, useState } from "react";

type Screen = "welcome" | "camera" | "waiting";

export default function Home() {
  const [screen, setScreen] = useState<Screen>("welcome");
  const [error, setError] = useState("");
  const [confirmedAdult, setConfirmedAdult] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  async function prepareCamera() {
    setError("");
    setScreen("camera");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user" },
        audio: true,
      });
      if (videoRef.current) videoRef.current.srcObject = stream;
    } catch {
      setError("Camera and microphone access is needed to start a chat.");
    }
  }

  function enterQueue() {
    setScreen("waiting");
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
        <section className="hero" id="top">
          <div className="hero-copy">
            <p className="eyebrow">RANDOM VIDEO CHAT</p>
            <h1>Meet someone new,<br /><em>right now.</em></h1>
            <p className="intro">One tap. One real person. A conversation that only exists in this moment.</p>
            <label className="age-check">
              <input type="checkbox" checked={confirmedAdult} onChange={(event) => setConfirmedAdult(event.target.checked)} />
              <span>I confirm that I am 18+ and I agree: RandomCam is for friendship, cultural exchange and language practice — not dating or sexual content.</span>
            </label>
            <button className="primary" onClick={prepareCamera} disabled={!confirmedAdult}>Start chatting <span>→</span></button>
            <p className="fine-print">Nudity, harassment and solicitation are prohibited. Report abuse in one tap.</p>
          </div>
          <div className="hero-art" aria-hidden="true">
            <div className="orbit orbit-one" /><div className="orbit orbit-two" />
            <div className="face-card face-one"><span>Hey!</span></div>
            <div className="face-card face-two"><span>New face</span></div>
            <div className="face-card face-three"><span>hello</span></div>
            <div className="floating-label">a real person is waiting</div>
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
            <h2>Ready to meet someone?</h2>
            <p>Your camera is only shared once you are matched.</p>
            <button className="primary" onClick={enterQueue} disabled={Boolean(error)}>Enter the room <span>→</span></button>
            <button className="text-button" onClick={() => setScreen("welcome")}>Not now</button>
          </div>
        </section>
      )}

      {screen === "waiting" && (
        <section className="waiting-stage">
          <div className="pulse" /><p className="eyebrow">FINDING SOMEONE</p>
          <h2>Looking for your next conversation.</h2>
          <p className="intro">RandomCam is preparing its first live rooms. You&apos;ll be able to connect as soon as the beta opens.</p>
          <button className="secondary" onClick={() => setScreen("welcome")}>Back to home</button>
        </section>
      )}

      <section className="principles">
        <article><span>01</span><h3>No profile</h3><p>Show up as yourself, without building an account first.</p></article>
        <article><span>02</span><h3>Just one person</h3><p>Private, one-to-one conversations. Leave whenever you want.</p></article>
        <article><span>03</span><h3>Respect first</h3><p>Friendship, culture and language only. No dating, sexual content, nudity or solicitation. Report abuse in one tap.</p></article>
      </section>

      <footer><span>© 2026 RandomCam</span><span>18+ only · Community rules · Privacy</span></footer>
    </main>
  );
}
