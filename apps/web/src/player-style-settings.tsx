import { useEffect, useState } from "react";

const DEFAULT_NAMEPLATE = "#1e3a5f";
const DEFAULT_NAME_COLOR = "#f8fafc";

interface Props {
  nameplateBg: string | null | undefined;
  nameColor: string | null | undefined;
  onApply: (style: { nameplateBg?: string | null; nameColor?: string | null }) => void;
}

export function PlayerStyleSettings({ nameplateBg, nameColor, onApply }: Props) {
  const [bg, setBg] = useState(nameplateBg ?? DEFAULT_NAMEPLATE);
  const [color, setColor] = useState(nameColor ?? DEFAULT_NAME_COLOR);

  useEffect(() => {
    setBg(nameplateBg ?? DEFAULT_NAMEPLATE);
    setColor(nameColor ?? DEFAULT_NAME_COLOR);
  }, [nameplateBg, nameColor]);

  return (
    <div className="player-style-settings">
      <p className="player-style-settings__hint">
        自分のネームプレートと、ログに表示される名前の色を設定できます。
      </p>
      <div className="player-style-settings__preview">
        <span
          className="player-style-settings__sample"
          style={{ background: bg, color }}
        >
          表示サンプル
        </span>
      </div>
      <label className="player-style-settings__field">
        <span>ネームプレート背景</span>
        <input type="color" value={bg} onChange={(e) => setBg(e.target.value)} />
      </label>
      <label className="player-style-settings__field">
        <span>名前の色</span>
        <input type="color" value={color} onChange={(e) => setColor(e.target.value)} />
      </label>
      <div className="player-style-settings__actions">
        <button
          type="button"
          onClick={() => onApply({ nameplateBg: bg, nameColor: color })}
        >
          適用
        </button>
        <button
          type="button"
          className="secondary"
          onClick={() => onApply({ nameplateBg: null, nameColor: null })}
        >
          リセット
        </button>
      </div>
    </div>
  );
}
