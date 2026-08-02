import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "How RandomCam works",
  description: "Learn how RandomCam supports respectful one-to-one random video conversations for adults, friendship, culture, and language practice.",
  alternates: {
    canonical: "/en",
    languages: { en: "/en", ja: "/ja", "x-default": "/en" },
  },
  openGraph: {
    url: "/en",
    locale: "en",
    title: "How RandomCam works",
    description: "A respectful random video chat for adults, friendship, culture, and language practice.",
  },
};

export default function EnglishInfoPage() {
  return (
    <main className="info-page" lang="en">
      <header className="topbar">
        <Link className="brand" href="/" aria-label="RandomCam home"><span className="brand-mark">R</span><span>randomcam</span></Link>
        <Link className="info-language" href="/ja" lang="ja">日本語</Link>
      </header>
      <article className="info-content">
        <p className="eyebrow">RANDOM VIDEO CHAT</p>
        <h1>One person. One conversation.</h1>
        <p className="intro">RandomCam is a place for adults to meet one new person for a respectful, one-to-one video conversation.</p>
        <h2>How it works</h2>
        <ol>
          <li>Confirm that you are 18 or older and agree to the community rules.</li>
          <li>Allow camera and microphone access, then enter the global waiting room.</li>
          <li>When matched, talk one-to-one. You can leave or choose another person at any time.</li>
        </ol>
        <h2>Built for respectful conversation</h2>
        <p>RandomCam is for friendship, cultural exchange, and language practice. Dating, sexual content, nudity, harassment, and solicitation are not allowed. You can report a person during a call when they break the rules.</p>
        <p className="info-note">For adults only. Do not share personal information with people you meet online.</p>
        <Link className="primary info-cta" href="/">Start a conversation <span>→</span></Link>
      </article>
    </main>
  );
}
