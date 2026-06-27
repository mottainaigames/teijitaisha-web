import { useEffect, useState } from "react";
import { CardEffectsButton } from "./card-effects-ui";

const RULE_STEPS = [
  {
    step: 1,
    src: "/rules/step-1.png",
    alt: "特殊効果のあるババ抜き。残業カードがババで、他プレイヤーに押し付けよう。",
  },
  {
    step: 2,
    src: "/rules/step-2.png",
    alt: "ペアを作って手札（仕事）を減らそう。",
  },
  {
    step: 3,
    src: "/rules/step-3.png",
    alt: "カード効果を使って残業を押し付け合え。ペアを場に出すと効果が発動。",
  },
  {
    step: 4,
    src: "/rules/step-4.png",
    alt: "定時退社を目指すか、労基で残業を告発せよ。",
  },
] as const;

function RulesModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="card-effects-modal rules-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="rules-modal-title"
    >
      <button
        type="button"
        className="card-effects-modal__backdrop"
        aria-label="閉じる"
        onClick={onClose}
      />
      <div className="card-effects-modal__panel">
        <div className="card-effects-modal__header">
          <h2 id="rules-modal-title">遊び方</h2>
          <button type="button" className="card-effects-modal__close" onClick={onClose}>
            閉じる
          </button>
        </div>
        <ol className="home-rules__comic home-rules__comic--modal">
          {RULE_STEPS.map(({ step, src, alt }) => (
            <li key={step} className="home-rules__panel">
              <img className="home-rules__img" src={src} alt={alt} loading="lazy" decoding="async" />
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

export function HomeRules() {
  const [rulesOpen, setRulesOpen] = useState(false);

  return (
    <section className="card home-rules" aria-labelledby="home-rules-heading">
      <h2 id="home-rules-heading" className="home-rules__heading">
        ルール
      </h2>
      <div className="home-rules__actions">
        <button type="button" className="secondary home-rules__btn" onClick={() => setRulesOpen(true)}>
          遊び方を見る
        </button>
        <CardEffectsButton className="home-rules__btn" label="カード一覧を見る" block />
      </div>
      <RulesModal open={rulesOpen} onClose={() => setRulesOpen(false)} />
    </section>
  );
}
