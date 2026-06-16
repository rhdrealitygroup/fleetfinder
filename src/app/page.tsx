import Link from "next/link";
import { redirect } from "next/navigation";
import { CompassMark } from "@/components/CompassMark";
import { CompassRose } from "@/components/CompassRose";
import { getSessionContext } from "@/lib/auth";

// Landing — "Navigation Chart" design: warm chart-paper palette (cream / rust /
// charcoal), Archivo + IBM Plex Mono, a drawn compass rose hero. High-fidelity
// recreation of the design handoff. Exact tokens live inline so this page reads
// as a faithful 1:1 of the prototype; product UI keeps the Inter/Newsreader system.
const ARCHIVO = "var(--font-archivo), 'Archivo', sans-serif";
const MONO = "var(--font-plex-mono), 'IBM Plex Mono', monospace";

export default async function HomePage() {
  // Signed-in users never need the marketing page — send them straight to the
  // app. (Middleware also does this; this is a server-side guarantee.)
  const { user } = await getSessionContext();
  if (user) redirect("/search");

  const legs = [
    { n: "01", leg: "LEG 1", t: "Plot the deal", b: "Make, model, trim, color, ZIP and the monthly payment your customer needs to hit." },
    { n: "02", leg: "LEG 2", t: "Triangulate every lot", b: "Live inventory across brands and dealers, deduped by VIN, ranked by fit and distance." },
    { n: "03", leg: "LEG 3", t: "Walk in and close", b: "Save winners to the customer's profile, run the exact lease number, and present." },
  ];

  return (
    <div style={{ position: "relative", minHeight: "100vh", background: "#fbf4ea", fontFamily: ARCHIVO, color: "#221d16", overflowX: "hidden" }}>
      <style>{`
        .lc-nav-link { cursor: pointer; transition: color .15s ease; }
        .lc-nav-link:hover { color: #c0492a; }
        .lc-btn-rust { transition: background-color .15s ease; }
        .lc-btn-rust:hover { background: #a83c20 !important; }
        .lc-btn-rust-light:hover { background: #d4542f !important; }
        .lc-btn-outline { transition: border-color .15s ease; }
        .lc-btn-outline:hover { border-color: #221d16 !important; }
        .lc-card-hover { transition: border-color .15s ease; }
        .lc-card-hover:hover { border-color: #c0492a !important; }
        .lc-grid-tex { position: fixed; inset: 0; pointer-events: none; z-index: 0;
          background-image: linear-gradient(rgba(34,29,22,.035) 1px,transparent 1px),linear-gradient(90deg,rgba(34,29,22,.035) 1px,transparent 1px);
          background-size: 56px 56px; }
        .lc-radial { position: fixed; top: -180px; right: -180px; width: 720px; height: 720px; border-radius: 50%;
          pointer-events: none; z-index: 0;
          background-image: repeating-radial-gradient(circle, transparent 0 58px, rgba(192,73,42,.05) 58px 59px); }
        @media (max-width: 880px) {
          .lc-hero { grid-template-columns: 1fr !important; gap: 24px !important; padding: 40px 0 48px !important; }
          .lc-hero h1 { font-size: 44px !important; }
          .lc-hero-rose { height: auto !important; order: -1; }
          .lc-grid-3 { grid-template-columns: 1fr !important; }
          .lc-grid-price { grid-template-columns: 1fr !important; }
          .lc-pad { padding: 0 22px !important; }
          .lc-nav-links span.lc-hide-sm { display: none !important; }
        }
      `}</style>

      {/* chart textures */}
      <div className="lc-grid-tex" aria-hidden />
      <div className="lc-radial" aria-hidden />

      <div style={{ position: "relative", zIndex: 1 }}>
        {/* ===== NAV ===== */}
        <div style={{ position: "sticky", top: 0, zIndex: 20, background: "rgba(251,244,234,.86)", backdropFilter: "blur(10px)", borderBottom: "1px solid rgba(34,29,22,.12)" }}>
          <div className="lc-pad" style={{ maxWidth: 1240, margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "space-between", height: 70, padding: "0 40px" }}>
            <Link href="/" style={{ display: "flex", alignItems: "center", gap: 9, textDecoration: "none", color: "#221d16" }}>
              <CompassMark className="w-7 h-7" />
              <span style={{ fontFamily: ARCHIVO, fontWeight: 800, fontSize: 19, letterSpacing: "-.02em" }}>LotCompass</span>
            </Link>
            <div className="lc-nav-links" style={{ display: "flex", alignItems: "center", gap: 28, fontSize: 14, fontWeight: 600, color: "#4b4338", whiteSpace: "nowrap" }}>
              <Link href="#how" className="lc-nav-link lc-hide-sm" style={{ color: "inherit", textDecoration: "none" }}>How it works</Link>
              <Link href="#instruments" className="lc-nav-link lc-hide-sm" style={{ color: "inherit", textDecoration: "none" }}>Product</Link>
              <Link href="#pricing" className="lc-nav-link lc-hide-sm" style={{ color: "inherit", textDecoration: "none" }}>Pricing</Link>
              <Link href="/login" className="lc-nav-link" style={{ color: "inherit", textDecoration: "none" }}>Sign in</Link>
              <Link href="/signup" className="lc-btn-rust" style={{ background: "#c0492a", color: "#fff", fontWeight: 700, padding: "10px 18px", borderRadius: 9, textDecoration: "none" }}>Start free</Link>
            </div>
          </div>
        </div>

        <div className="lc-pad" style={{ maxWidth: 1240, margin: "0 auto", padding: "0 40px" }}>
          {/* ===== HERO ===== */}
          <div className="lc-hero" style={{ display: "grid", gridTemplateColumns: "1.05fr .95fr", gap: 48, alignItems: "center", padding: "64px 0 72px" }}>
            <div>
              <div style={{ fontFamily: MONO, fontSize: 12, letterSpacing: ".14em", textTransform: "uppercase", color: "#c0492a", marginBottom: 20 }}>Cross-brand lease inventory search</div>
              <h1 style={{ fontFamily: ARCHIVO, fontSize: 62, lineHeight: 1.02, fontWeight: 800, letterSpacing: "-.035em", margin: "0 0 22px" }}>Chart a course<br />to the right car.</h1>
              <p style={{ fontSize: 18, lineHeight: 1.6, color: "#5b5246", margin: "0 0 30px", maxWidth: 460 }}>Plot a ZIP, set your radius, and let LotCompass triangulate live inventory across every brand and dealer in range — deduped by VIN, ranked by fit, scoped to the dealers you actually work with.</p>
              <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                <Link href="/signup" className="lc-btn-rust" style={{ background: "#c0492a", color: "#fff", fontWeight: 700, fontSize: 16, padding: "15px 26px", borderRadius: 10, boxShadow: "0 12px 24px -10px rgba(192,73,42,.5)", textDecoration: "none" }}>Start your 14-day trial</Link>
                <Link href="/login" className="lc-btn-outline" style={{ fontWeight: 600, fontSize: 16, padding: "15px 24px", borderRadius: 10, border: "1px solid rgba(34,29,22,.2)", color: "#221d16", textDecoration: "none" }}>See a live search →</Link>
              </div>
              <div style={{ display: "flex", gap: 26, marginTop: 30, fontFamily: MONO, fontSize: 12, letterSpacing: ".04em", color: "#8a7d6b", flexWrap: "wrap" }}>
                <span>40+ BRANDS</span><span>NATIONWIDE</span><span>VIN-DEDUPED</span>
              </div>
            </div>
            {/* compass rose (focal) */}
            <div className="lc-hero-rose" style={{ position: "relative", height: 600, overflow: "visible", display: "grid", placeItems: "center" }}>
              <CompassRose size={560} />
            </div>
          </div>

          {/* ===== HOW IT WORKS ===== */}
          <div id="how" style={{ borderTop: "1px solid rgba(34,29,22,.12)", padding: "54px 0", scrollMarginTop: 80 }}>
            <div style={{ fontFamily: MONO, fontSize: 12, letterSpacing: ".14em", textTransform: "uppercase", color: "#c0492a", marginBottom: 8 }}>The passage · three legs</div>
            <h2 style={{ fontFamily: ARCHIVO, fontSize: 34, fontWeight: 800, letterSpacing: "-.02em", margin: "0 0 32px" }}>From customer ask to the right car.</h2>
            <div className="lc-grid-3" style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 18 }}>
              {legs.map((s) => (
                <div key={s.n} style={{ background: "#fffdf8", border: "1px solid rgba(34,29,22,.12)", borderRadius: 14, padding: 24 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
                    <span style={{ fontFamily: ARCHIVO, fontSize: 40, fontWeight: 900, letterSpacing: "-.03em", color: "rgba(34,29,22,.16)" }}>{s.n}</span>
                    <span style={{ fontFamily: MONO, fontSize: 10.5, color: "#c0492a" }}>{s.leg}</span>
                  </div>
                  <h3 style={{ fontFamily: ARCHIVO, fontSize: 19, fontWeight: 700, margin: "0 0 8px" }}>{s.t}</h3>
                  <p style={{ fontSize: 14.5, lineHeight: 1.55, color: "#5b5246", margin: 0 }}>{s.b}</p>
                </div>
              ))}
            </div>
          </div>

          {/* ===== CAPABILITIES (Instruments) ===== */}
          <div id="instruments" style={{ borderTop: "1px solid rgba(34,29,22,.12)", padding: "54px 0", scrollMarginTop: 80 }}>
            <div style={{ fontFamily: MONO, fontSize: 12, letterSpacing: ".14em", textTransform: "uppercase", color: "#c0492a", marginBottom: 8 }}>Instruments</div>
            <h2 style={{ fontFamily: ARCHIVO, fontSize: 34, fontWeight: 800, letterSpacing: "-.02em", margin: "0 0 32px" }}>Built for how you actually work.</h2>
            <div className="lc-grid-3" style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 18 }}>
              {/* Live Search */}
              <Link href="/search" className="lc-card-hover" style={{ display: "block", background: "#fffdf8", border: "1px solid rgba(34,29,22,.12)", borderRadius: 14, padding: 22, textDecoration: "none", color: "#221d16" }}>
                <div style={{ width: 34, height: 34, borderRadius: "50%", border: "2px solid #c0492a", position: "relative", marginBottom: 14 }}>
                  <span style={{ position: "absolute", left: "50%", top: "50%", width: 0, height: 0, borderLeft: "4px solid transparent", borderRight: "4px solid transparent", borderBottom: "13px solid #c0492a", transform: "translate(-50%,-100%) rotate(38deg)", transformOrigin: "bottom" }} />
                </div>
                <h3 style={{ fontFamily: ARCHIVO, fontSize: 18, fontWeight: 700, margin: "0 0 6px" }}>Live Search</h3>
                <p style={{ fontSize: 14, lineHeight: 1.5, color: "#5b5246", margin: 0 }}>Every brand and dealer, nationwide or near a ZIP. Filter to trim, color, packages and target payment.</p>
              </Link>
              {/* VIN Decode */}
              <div className="lc-card-hover" style={{ background: "#fffdf8", border: "1px solid rgba(34,29,22,.12)", borderRadius: 14, padding: 22 }}>
                <div style={{ width: 34, height: 34, borderRadius: 7, border: "2px solid #221d16", display: "grid", placeItems: "center", fontFamily: MONO, fontSize: 11, fontWeight: 600, marginBottom: 14 }}>17</div>
                <h3 style={{ fontFamily: ARCHIVO, fontSize: 18, fontWeight: 700, margin: "0 0 6px" }}>VIN Decode</h3>
                <p style={{ fontSize: 14, lineHeight: 1.5, color: "#5b5246", margin: 0 }}>Paste a VIN, get the full factory build sheet — every package, every option, the original MSRP.</p>
              </div>
              {/* Why-No-Match */}
              <div className="lc-card-hover" style={{ background: "#fffdf8", border: "1px solid rgba(34,29,22,.12)", borderRadius: 14, padding: 22 }}>
                <div style={{ width: 34, height: 34, borderRadius: "50%", border: "2px solid #c0492a", color: "#c0492a", display: "grid", placeItems: "center", fontWeight: 800, fontSize: 18, marginBottom: 14 }}>?</div>
                <h3 style={{ fontFamily: ARCHIVO, fontSize: 18, fontWeight: 700, margin: "0 0 6px" }}>Why-No-Match</h3>
                <p style={{ fontSize: 14, lineHeight: 1.5, color: "#5b5246", margin: 0 }}>Empty search? It tells you exactly why — and the one change that brings the cars back.</p>
              </div>
              {/* Customer Profiles */}
              <Link href="/customers" className="lc-card-hover" style={{ display: "block", background: "#fffdf8", border: "1px solid rgba(34,29,22,.12)", borderRadius: 14, padding: 22, textDecoration: "none", color: "#221d16" }}>
                <div style={{ width: 34, height: 34, borderRadius: "50%", border: "2px solid #221d16", display: "grid", placeItems: "center", fontWeight: 700, fontSize: 12, marginBottom: 14 }}>★</div>
                <h3 style={{ fontFamily: ARCHIVO, fontSize: 18, fontWeight: 700, margin: "0 0 6px" }}>Customer Profiles</h3>
                <p style={{ fontSize: 14, lineHeight: 1.5, color: "#5b5246", margin: 0 }}>Save a customer&apos;s needs, star the cars that fit, build side-by-side compare lists.</p>
              </Link>
              {/* Dealer Network */}
              <div className="lc-card-hover" style={{ background: "#fffdf8", border: "1px solid rgba(34,29,22,.12)", borderRadius: 14, padding: 22 }}>
                <div style={{ width: 34, height: 34, borderRadius: "50%", border: "2px solid #221d16", display: "grid", placeItems: "center", fontWeight: 700, fontSize: 14, marginBottom: 14 }}>⛢</div>
                <h3 style={{ fontFamily: ARCHIVO, fontSize: 18, fontWeight: 700, margin: "0 0 6px" }}>Your Dealer Network</h3>
                <p style={{ fontSize: 14, lineHeight: 1.5, color: "#5b5246", margin: 0 }}>Pick the dealers you work with once — your whole team&apos;s searches scope to them.</p>
              </div>
              {/* Dark CTA */}
              <div style={{ background: "#221d16", color: "#f3ead8", borderRadius: 14, padding: 22, display: "flex", flexDirection: "column", justifyContent: "center" }}>
                <h3 style={{ fontFamily: ARCHIVO, fontSize: 20, fontWeight: 800, margin: "0 0 8px", color: "#fff" }}>One bearing. Every lot.</h3>
                <p style={{ fontSize: 14, lineHeight: 1.5, color: "#c8bca8", margin: "0 0 14px" }}>See the whole experience in two minutes.</p>
                <Link href="/signup" className="lc-btn-rust-light" style={{ alignSelf: "flex-start", background: "#c0492a", color: "#fff", fontWeight: 700, fontSize: 14, padding: "11px 18px", borderRadius: 9, textDecoration: "none", transition: "background-color .15s ease" }}>Open a search →</Link>
              </div>
            </div>
          </div>

          {/* ===== PRICING ===== */}
          <div id="pricing" style={{ borderTop: "1px solid rgba(34,29,22,.12)", padding: "54px 0 72px", scrollMarginTop: 80 }}>
            <div style={{ fontFamily: MONO, fontSize: 12, letterSpacing: ".14em", textTransform: "uppercase", color: "#c0492a", marginBottom: 8 }}>Provisioning</div>
            <h2 style={{ fontFamily: ARCHIVO, fontSize: 34, fontWeight: 800, letterSpacing: "-.02em", margin: "0 0 6px" }}>Priced for one office. Scales with your bench.</h2>
            <p style={{ fontSize: 16, color: "#5b5246", margin: "0 0 28px" }}>No setup fees. 14-day free trial. Add or remove agents anytime.</p>
            <div className="lc-grid-price" style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 18 }}>
              {/* price card */}
              <div className="lc-grid-3" style={{ background: "#fffdf8", border: "1px solid rgba(34,29,22,.14)", borderRadius: 16, padding: 30, display: "grid", gridTemplateColumns: "auto 1fr", gap: "0 32px", alignItems: "start" }}>
                <div style={{ borderRight: "1px solid rgba(34,29,22,.12)", paddingRight: 32 }}>
                  <div style={{ fontFamily: ARCHIVO, fontSize: 54, fontWeight: 900, letterSpacing: "-.03em", lineHeight: 1 }}>$100<span style={{ fontSize: 18, fontWeight: 600, color: "#8a7d6b" }}>/mo</span></div>
                  <div style={{ fontFamily: MONO, fontSize: 11, color: "#8a7d6b", marginTop: 6 }}>PER COMPANY · OWNER ACCOUNT</div>
                  <div style={{ marginTop: 18, fontFamily: ARCHIVO, fontSize: 26, fontWeight: 800, color: "#c0492a" }}>+ $15<span style={{ fontSize: 14, fontWeight: 600, color: "#8a7d6b" }}>/agent</span></div>
                  <div style={{ fontFamily: MONO, fontSize: 11, color: "#8a7d6b", marginTop: 4 }}>ADD A FEW · ADD TEN</div>
                </div>
                <div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 9, fontSize: 14.5, color: "#3a342b" }}>
                    {["Unlimited live searches", "Instant VIN decode & build sheets", "Customer profiles & compare lists", "Your whole dealer network", "Owner sees everyone's activity"].map((f) => (
                      <span key={f}>✓&nbsp;&nbsp;{f}</span>
                    ))}
                  </div>
                  <Link href="/signup" className="lc-btn-rust" style={{ display: "inline-block", marginTop: 22, background: "#c0492a", color: "#fff", fontWeight: 700, fontSize: 15, padding: "13px 24px", borderRadius: 10, textDecoration: "none" }}>Start free trial</Link>
                  <div style={{ fontFamily: MONO, fontSize: 11, color: "#8a7d6b", marginTop: 12 }}>$0 TODAY · CARD STARTS YOUR TRIAL · CANCEL BY DAY 14</div>
                </div>
              </div>
              {/* referral card */}
              <div style={{ background: "#f3ead8", border: "1px dashed rgba(192,73,42,.5)", borderRadius: 16, padding: 30, display: "flex", flexDirection: "column", justifyContent: "center" }}>
                <div style={{ fontFamily: MONO, fontSize: 11, letterSpacing: ".1em", color: "#c0492a", marginBottom: 10 }}>REFERRAL</div>
                <h3 style={{ fontFamily: ARCHIVO, fontSize: 24, fontWeight: 800, margin: "0 0 8px" }}>Give $50, get $50.</h3>
                <p style={{ fontSize: 14.5, lineHeight: 1.55, color: "#5b5246", margin: "0 0 16px" }}>Know other brokers? Invite them. They get $50 off, you get $50 credit the moment they subscribe.</p>
                <Link href="/signup" style={{ alignSelf: "flex-start", fontWeight: 700, fontSize: 14, color: "#c0492a", borderBottom: "2px solid #c0492a", paddingBottom: 2, textDecoration: "none" }}>Get your link →</Link>
              </div>
            </div>
          </div>

          {/* ===== FOOTER ===== */}
          <div style={{ borderTop: "1px solid rgba(34,29,22,.14)", padding: "30px 0 60px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, opacity: .85 }}>
              <CompassMark className="w-6 h-6" />
              <span style={{ fontFamily: ARCHIVO, fontWeight: 800, fontSize: 16, letterSpacing: "-.02em" }}>LotCompass</span>
            </div>
            <div style={{ fontFamily: MONO, fontSize: 11, color: "#8a7d6b" }}>LotCompass · by RHD Reality Group · © 2026</div>
          </div>
        </div>
      </div>
    </div>
  );
}
