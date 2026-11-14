"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useI18n } from "@/lib/i18n";
import { type Criterion } from "@/lib/data";
import { initialsOf, locationOf, ME_COLOR, SOCIAL_KEYS, useMe, type MeProfile } from "@/lib/me";
import { usdToNear } from "@/lib/near";
import { Orin } from "@/components/Orin";
import { Icon } from "@/components/Icon";
import { BriefDrafter } from "@/components/DraftContract";
import { sendRequest } from "@/lib/requests";
import { Avatar, Confetti, Country, Kicker, LangSwitch, Logo, Product, ThemeSwitch } from "@/components/ui";

export default function PublicOrderPage() {
  const { t, money, lang } = useI18n();
  const { me, signedIn } = useMe();
  const params = useParams<{ handle: string }>();
  const handle = (params?.handle ?? "").toString();

  const [published, setPublished] = useState<MeProfile | null>(null);
  useEffect(() => {
    if (!handle) return;
    let alive = true;
    fetch(`/api/profiles/${encodeURIComponent(handle)}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (alive && d?.profile) setPublished(d.profile as MeProfile); })
      .catch(() => {});
    return () => { alive = false; };
  }, [handle]);

  const shown = published ?? me;
  const firstName = shown.name.split(" ")[0];
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [nearClient, setNearClient] = useState("");
  const [payAsset, setPayAsset] = useState<"NEAR" | "USDC" | "USDT" | "ETH">("NEAR");
  const [brief, setBrief] = useState("");
  const [criteria, setCriteria] = useState<Criterion[]>([]);
  const [budget, setBudget] = useState<number | "">("");
  const [title, setTitle] = useState("");
  const [sent, setSent] = useState(false);
  const [sending, setSending] = useState(false);
  const [ref, setRef] = useState("");
  const [fire, setFire] = useState(0);

  const ready = name.trim().length > 1 && /\S+@\S+/.test(email) && criteria.length > 0 && Number(budget) > 0;
  const nearEst = Number(budget) > 0 ? usdToNear(Number(budget)) : 0;

  const send = async () => {
    if (!ready || sending) return;
    setSending(true);
    const { id } = await sendRequest({
      handle,
      name: name.trim(),
      email: email.trim(),
      nearAccount: nearClient.trim() || undefined,
      brief: brief.trim(),
      title,
      budget: Number(budget),
      criteria,
    });
    setRef(id);
    setSending(false);
    setSent(true);
    setFire((f) => f + 1);
  };

  const tagList = shown.tags.length ? shown.tags : [t("pub.skill1"), t("pub.skill2"), t("pub.skill3"), t("pub.skill4")];

  return (
    <div>
      <div style={{ position: "sticky", top: 14, zIndex: 35, padding: "12px 20px 0" }}>
        <header className="pub-nav">
          <Logo size={44} />
          <div className="row" style={{ gap: 8 }}>
            <ThemeSwitch />
            <LangSwitch compact />
            {signedIn && me.handle.toLowerCase() === handle.toLowerCase() ? (
              <Link href="/dashboard" className="btn sm mint">{t("pub.imOwner", { name: firstName })}</Link>
            ) : (
              <Link href={signedIn ? "/dashboard" : "/signin"} className="btn sm">{signedIn ? t("lp.openApp") : t("lp.signin")}</Link>
            )}
          </div>
        </header>
      </div>

      <main className="pub-main">
        {/* Freelancer Glass Profile */}
        <aside className="card pub-profile rise">
          <div className="pub-cover">
            <Orin pose="idle" size={78} style={{ position: "absolute", right: 18, bottom: 8 }} />
          </div>
          <div style={{ padding: "0 22px 22px" }}>
            <div style={{ marginTop: -34, position: "relative", zIndex: 2 }}>
              <Avatar p={{ initials: initialsOf(shown.name), color: ME_COLOR }} size={72} photo={shown.photo} />
            </div>
            <h1 style={{ fontSize: 25, marginTop: 10 }}>{shown.name}</h1>
            <div className="mono tiny" style={{ color: "var(--mint)", fontWeight: 600, marginTop: 3 }}>
              {shown.nearAccount}
            </div>
            <div className="row tiny muted" style={{ gap: 6, marginTop: 4 }}>
              <Icon name="globe" size={13} /> {locationOf(shown, lang)}{shown.city && shown.country ? <> <Country code={shown.country} /></> : null} · EN / ID / 中文
            </div>
            <p className="muted" style={{ marginTop: 12, lineHeight: 1.6, fontSize: 14 }}>{shown.bio}</p>

            <div className="row wrap" style={{ gap: 6, marginTop: 14 }}>
              {tagList.slice(0, 6).map((x) => <span key={x} className="chip">{x}</span>)}
            </div>

            {(shown.socials ? SOCIAL_KEYS.filter((k) => shown.socials![k]) : []).length > 0 && (
              <div className="row wrap" style={{ gap: 8, marginTop: 12 }}>
                {SOCIAL_KEYS.filter((k) => shown.socials && shown.socials[k]).map((k) => (
                  <a key={k} className="chip" href={shown.socials![k]} target="_blank" rel="noreferrer noopener">
                    <Icon name="link" size={12} /> {t(`me.f.${k}`)}
                  </a>
                ))}
              </div>
            )}

            {(shown.portfolio?.length ?? 0) > 0 && (
              <div style={{ marginTop: 18 }}>
                <Kicker>{t("pub.portfolio")}</Kicker>
                <div className="col" style={{ gap: 8, marginTop: 10 }}>
                  {shown.portfolio!.map((it, i) => (
                    <a
                      key={i}
                      href={(it.link || it.url) || undefined}
                      target={(it.link || it.url) ? "_blank" : undefined}
                      rel="noreferrer"
                      className="row"
                      style={{ padding: "9px 12px", borderRadius: 11, border: "1px solid var(--border)", background: "rgba(255,255,255,0.025)", gap: 10 }}
                    >
                      <span style={{ width: 32, height: 32, borderRadius: 8, overflow: "hidden", border: "1px solid var(--border-strong)", flex: "none" }}>
                        <Product kind={(["bottle", "mug", "watch", "reel"][i % 4]) as "bottle"} />
                      </span>
                      <div className="col grow" style={{ minWidth: 0 }}>
                        <b style={{ fontSize: 13 }}>{it.title || it.label}</b>
                        {it.note && <span className="tiny muted">{it.note}</span>}
                      </div>
                    </a>
                  ))}
                </div>
              </div>
            )}

            <div className="card" style={{ marginTop: 18, padding: 12, background: "rgba(0,236,151,0.06)", borderColor: "var(--border-glow)", fontSize: 12.5 }}>
              <b style={{ color: "var(--mint)" }}><Icon name="shield" size={13} /> {t("pub.trust1")}</b> · {t("pub.trust2")} · {t("pub.trust3")}
            </div>
          </div>
        </aside>

        {/* Client Intake Form */}
        <section className="card pad rise">
          {!sent ? (
            <div className="col" style={{ gap: 16 }}>
              <div>
                <Kicker amber>NEAR ESCROW INTAKE</Kicker>
                <h2 style={{ fontSize: 26, marginTop: 10 }}>{t("pub.formTitle", { name: firstName })}</h2>
                <p className="muted" style={{ marginTop: 4 }}>{t("pub.formSub")}</p>
              </div>

              <div className="grid2">
                <div className="field">
                  <label>{t("pub.yourName")}</label>
                  <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Alex Mercer" />
                </div>
                <div className="field">
                  <label>{t("pub.yourEmail")}</label>
                  <input className="input" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="alex@protocol.xyz" />
                </div>
              </div>

              <div className="field">
                <label>Your NEAR Account (optional — or fund from USDC / ETH via NEAR Intents)</label>
                <input className="input mono" value={nearClient} onChange={(e) => setNearClient(e.target.value)} placeholder="alex.testnet" />
              </div>

              <BriefDrafter
                brief={brief}
                setBrief={setBrief}
                example={t("pub.exampleBrief", { name: firstName })}
                placeholder={t("pub.briefPh", { name: firstName })}
                onDrafted={(r) => {
                  setCriteria(r.criteria);
                  setTitle(r.suggestedTitle);
                  if (!budget) setBudget(r.suggestedAmount);
                }}
              />

              <div className="grid2">
                <div className="field">
                  <label>{t("pub.budget")}</label>
                  <input
                    type="number"
                    className="input"
                    value={budget}
                    onChange={(e) => setBudget(e.target.value ? Number(e.target.value) : "")}
                    placeholder="350"
                  />
                </div>
                <div className="field">
                  <label>Preferred Settlement Asset (NEAR Intents 1-Click)</label>
                  <select className="select" value={payAsset} onChange={(e) => setPayAsset(e.target.value as "NEAR")}>
                    <option value="NEAR">Native NEAR (Ⓝ)</option>
                    <option value="USDC">USDC → NEAR Vault (via Intents)</option>
                    <option value="USDT">USDT → NEAR Vault (via Intents)</option>
                    <option value="ETH">ETH → NEAR Vault (via Intents)</option>
                  </select>
                </div>
              </div>

              {Number(budget) > 0 && (
                <div className="row between mono tiny" style={{ padding: "10px 14px", borderRadius: 11, border: "1px solid var(--border-glow)", background: "rgba(0,236,151,0.06)" }}>
                  <span>Vault Preview (`nearsignet.testnet`):</span>
                  <b style={{ color: "var(--mint)" }}>{money(Number(budget))} ≈ {nearEst} NEAR {payAsset !== "NEAR" ? `(from ${payAsset})` : ""}</b>
                </div>
              )}

              <button className="btn lg mint" disabled={!ready || sending} onClick={send}>
                <Icon name="send" size={16} /> {sending ? "Submitting…" : t("pub.send", { name: firstName })}
              </button>
              <span className="tiny muted" style={{ textAlign: "center" }}>{t("pub.noCharge")}</span>
            </div>
          ) : (
            <div className="col pop-in" style={{ alignItems: "center", textAlign: "center", padding: "36px 16px", gap: 14 }}>
              <Orin size={118} pose="sealed" />
              <span className="mono badge st-paid">{ref}</span>
              <h2 style={{ fontSize: 28 }}>{t("pub.sentTitle", { name: firstName })}</h2>
              <p className="muted" style={{ maxWidth: 460 }}>
                {t("pub.sentSub", { name: firstName, email, amount: money(Number(budget)) })} ({nearEst} NEAR)
              </p>
              <div className="row wrap" style={{ gap: 10, marginTop: 8 }}>
                <button className="btn" onClick={() => { setSent(false); setBrief(""); setCriteria([]); }}>
                  {t("pub.another")}
                </button>
                <Link href={`/orders/${ref}`} className="btn mint">
                  Open in Freelancer Terminal →
                </Link>
              </div>
            </div>
          )}
        </section>
      </main>

      <Confetti fire={fire} />

      <style>{`
        .pub-nav{
          max-width:1220px;margin:0 auto;padding:10px 18px;
          display:flex;justify-content:space-between;align-items:center;
          background:rgba(11,16,26,0.78);backdrop-filter:blur(22px);
          border:1px solid var(--border-strong);border-radius:18px;
        }
        [data-theme="daylight"] .pub-nav{background:rgba(255,255,255,0.88)}
        .pub-main{max-width:1220px;margin:0 auto;padding:24px 24px 60px;display:grid;grid-template-columns:370px 1fr;gap:24px;align-items:start}
        .pub-profile{overflow:hidden}
        .pub-cover{height:104px;background:linear-gradient(135deg, rgba(0,236,151,0.18), rgba(7,10,15,0.9) 65%, rgba(245,158,11,0.16));border-bottom:1px solid var(--border);position:relative}
        .grid2{display:grid;grid-template-columns:1fr 1fr;gap:12px}
        @media (max-width:900px){.pub-main{grid-template-columns:1fr}.grid2{grid-template-columns:1fr}}
      `}</style>
    </div>
  );
}
