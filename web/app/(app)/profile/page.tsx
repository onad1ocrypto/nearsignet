"use client";

import Link from "next/link";
import { useState } from "react";
import { useI18n } from "@/lib/i18n";
import { hostOf, initialsOf, ME_COLOR, SOCIAL_KEYS, useMe } from "@/lib/me";
import { Avatar, Kicker, Toast } from "@/components/ui";
import { Icon } from "@/components/Icon";

export default function ProfilePage() {
  const { t } = useI18n();
  const { me, updateMe, resetMe } = useMe();

  const [name, setName] = useState(me.name);
  const [handle, setHandle] = useState(me.handle);
  const [nearAccount, setNearAccount] = useState(me.nearAccount);
  const [city, setCity] = useState(me.city);
  const [country, setCountry] = useState(me.country);
  const [bio, setBio] = useState(me.bio);
  const [tags, setTags] = useState(me.tags.join(", "));
  const [socials, setSocials] = useState<Record<string, string>>({ ...(me.socials ?? {}) });
  const [portfolio, setPortfolio] = useState(me.portfolio ?? []);
  const [saved, setSaved] = useState(false);

  const onSave = () => {
    updateMe({
      name: name.trim() || me.name,
      handle: handle.trim().toLowerCase().replace(/[^a-z0-9-_]/g, "") || me.handle,
      nearAccount: nearAccount.trim().toLowerCase() || me.nearAccount,
      city: city.trim(),
      country: country.trim().toUpperCase().slice(0, 2),
      bio: bio.trim(),
      tags: tags.split(",").map((s) => s.trim()).filter(Boolean),
      socials,
      portfolio,
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="col" style={{ gap: 20, maxWidth: 900, margin: "0 auto" }}>
      <div className="row between wrap" style={{ gap: 12 }}>
        <div>
          <Kicker>{t("me.kicker")}</Kicker>
          <h1 style={{ fontSize: 30, marginTop: 8 }}>{t("me.title")}</h1>
          <p className="muted">{t("me.sub")}</p>
        </div>
        <div className="row wrap" style={{ gap: 8 }}>
          <Link href={`/to/${me.handle}`} className="btn sm">
            <Icon name="link" size={14} /> {t("me.preview")}
          </Link>
          <button className="btn sm mint" onClick={onSave}>
            <Icon name="check" size={14} /> {t("me.save")}
          </button>
        </div>
      </div>

      {/* Identity & NEAR Payout Account */}
      <div className="card pad col" style={{ gap: 14 }}>
        <div className="row" style={{ gap: 16 }}>
          <Avatar p={{ initials: initialsOf(name || me.name), color: ME_COLOR }} size={66} photo={me.photo} />
          <div>
            <b style={{ fontSize: 19 }}>{name || me.name}</b>
            <div className="mono tiny" style={{ color: "var(--mint)", fontWeight: 700 }}>{nearAccount}</div>
            <div className="mono tiny muted">{hostOf()}/to/{handle}</div>
          </div>
        </div>

        <div className="pgrid2">
          <div className="field">
            <label>{t("me.f.name")}</label>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="field">
            <label>{t("me.f.near")}</label>
            <input className="input mono" value={nearAccount} onChange={(e) => setNearAccount(e.target.value)} placeholder="your-studio.testnet" />
            <span className="tiny muted">{t("me.f.nearSub")}</span>
          </div>
        </div>

        <div className="pgrid3">
          <div className="field">
            <label>{t("me.f.handle")}</label>
            <input className="input mono" value={handle} onChange={(e) => setHandle(e.target.value)} />
          </div>
          <div className="field">
            <label>{t("me.f.city")}</label>
            <input className="input" value={city} onChange={(e) => setCity(e.target.value)} />
          </div>
          <div className="field">
            <label>{t("me.f.country")}</label>
            <input className="input mono" value={country} onChange={(e) => setCountry(e.target.value)} maxLength={2} />
          </div>
        </div>

        <div className="field">
          <label>{t("me.f.bio")}</label>
          <textarea className="textarea" style={{ minHeight: 90 }} value={bio} onChange={(e) => setBio(e.target.value)} />
        </div>

        <div className="field">
          <label>{t("me.f.tags")}</label>
          <input className="input" value={tags} onChange={(e) => setTags(e.target.value)} />
        </div>
      </div>

      {/* Social Links */}
      <div className="card pad col" style={{ gap: 12 }}>
        <h3 style={{ fontSize: 18 }}>{t("me.sec.socials")}</h3>
        <div className="pgrid2">
          {SOCIAL_KEYS.map((k) => (
            <div key={k} className="field">
              <label>{t(`me.f.${k}`)}</label>
              <input
                className="input"
                value={socials[k] ?? ""}
                onChange={(e) => setSocials((s) => ({ ...s, [k]: e.target.value }))}
                placeholder="https://..."
              />
            </div>
          ))}
        </div>
      </div>

      {/* Portfolio */}
      <div id="portfolio" className="card pad col" style={{ gap: 12 }}>
        <div className="row between">
          <div>
            <h3 style={{ fontSize: 18 }}>{t("me.sec.portfolio")}</h3>
            <p className="tiny muted">{t("me.sec.portfolioSub")}</p>
          </div>
          <button
            className="btn sm"
            onClick={() => setPortfolio((p) => [...p, { title: "", link: "", note: "" }])}
          >
            <Icon name="plus" size={14} /> {t("me.pf.add")}
          </button>
        </div>

        {portfolio.map((item, idx) => (
          <div key={idx} className="pgrid3" style={{ padding: 12, borderRadius: 12, border: "1px solid var(--border-strong)", background: "rgba(255,255,255,0.025)" }}>
            <input
              className="input"
              placeholder={t("me.pf.titlePh")}
              value={item.title ?? item.label ?? ""}
              onChange={(e) => setPortfolio((p) => p.map((x, i) => (i === idx ? { ...x, title: e.target.value, label: e.target.value } : x)))}
            />
            <input
              className="input"
              placeholder={t("me.pf.notePh")}
              value={item.note ?? ""}
              onChange={(e) => setPortfolio((p) => p.map((x, i) => (i === idx ? { ...x, note: e.target.value } : x)))}
            />
            <div className="row" style={{ gap: 6 }}>
              <input
                className="input"
                placeholder={t("me.pf.linkPh")}
                value={item.link ?? item.url ?? ""}
                onChange={(e) => setPortfolio((p) => p.map((x, i) => (i === idx ? { ...x, link: e.target.value, url: e.target.value } : x)))}
              />
              <button className="btn sm ghost" onClick={() => setPortfolio((p) => p.filter((_, i) => i !== idx))}>
                <Icon name="x" size={15} />
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="row between">
        <button className="btn sm ghost" onClick={resetMe}>{t("me.reset")}</button>
        <button className="btn lg mint" onClick={onSave}>
          <Icon name="check" size={16} /> {t("me.save")}
        </button>
      </div>

      <Toast show={saved}><Icon name="check" size={16} /> {t("me.saved")}</Toast>

      <style>{`
        .pgrid2{display:grid;grid-template-columns:1fr 1fr;gap:12px}
        .pgrid3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px}
        @media (max-width:740px){.pgrid2,.pgrid3{grid-template-columns:1fr}}
      `}</style>
    </div>
  );
}
