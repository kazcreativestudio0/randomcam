import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "RandomCamの使い方｜世界とつながるランダムビデオチャット",
  description: "成人限定。友達づくり、文化交流、語学練習のために、世界の誰かと1対1で話せるRandomCamの使い方と安全ルール。",
  alternates: {
    canonical: "/ja",
    languages: { en: "/en", ja: "/ja", "x-default": "/en" },
  },
  openGraph: {
    url: "/ja",
    locale: "ja_JP",
    title: "RandomCamの使い方｜世界とつながるランダムビデオチャット",
    description: "成人限定。友達づくり、文化交流、語学練習のための、1対1ランダムビデオチャット。",
  },
};

export default function JapaneseInfoPage() {
  return (
    <main className="info-page" lang="ja">
      <header className="topbar">
        <a className="brand" href="/" aria-label="RandomCam home"><span className="brand-mark">R</span><span>randomcam</span></a>
        <a className="info-language" href="/en" lang="en">English</a>
      </header>
      <article className="info-content">
        <p className="eyebrow">RANDOM VIDEO CHAT</p>
        <h1>世界の誰かと、今すぐ話す。</h1>
        <p className="intro">RandomCamは、成人が世界の誰かと1対1で、敬意を持って話すためのランダムビデオチャットです。</p>
        <h2>使い方</h2>
        <ol>
          <li>18歳以上であることと、コミュニティルールに同意します。</li>
          <li>カメラとマイクを許可して、世界共通の待機室へ入ります。</li>
          <li>相手とマッチしたら1対1で会話します。いつでも会話を終えたり、次の相手を探したりできます。</li>
        </ol>
        <h2>大切にしていること</h2>
        <p>RandomCamは、友達づくり、文化交流、語学練習のためのサービスです。恋愛目的、性的な内容、露出、嫌がらせ、勧誘は禁止です。ルール違反を見かけた場合は、通話中に通報できます。</p>
        <p className="info-note">成人限定です。オンラインで会った相手に個人情報を伝えないでください。</p>
        <a className="primary info-cta" href="/">会話をはじめる <span>→</span></a>
      </article>
    </main>
  );
}
