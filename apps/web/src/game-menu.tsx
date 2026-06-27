import { useEffect, useState, type ReactNode } from "react";
import { CardEffectsModal } from "./card-effects-ui";

interface Props {
  open: boolean;
  onClose: () => void;
  onLeave: () => void;
  roomCode: string;
  showLeave?: boolean;
  showCpuSpeed?: boolean;
  cpuSpeedLabel?: string;
  onCycleCpuSpeed?: () => void;
  showAdvanceCpu?: boolean;
  onAdvanceCpu?: () => void;
  children?: ReactNode;
}

export function GameMenu({
  open,
  onClose,
  onLeave,
  roomCode,
  showLeave = true,
  showCpuSpeed,
  cpuSpeedLabel,
  onCycleCpuSpeed,
  showAdvanceCpu,
  onAdvanceCpu,
  children,
}: Props) {
  const [effectsOpen, setEffectsOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  return (
    <>
      {open && (
        <div className="game-menu" role="dialog" aria-modal="true" aria-label="メニュー">
          <button type="button" className="game-menu__backdrop" aria-label="閉じる" onClick={onClose} />
          <div className="game-menu__panel">
            <div className="game-menu__header">
              <div>
                <p className="game-menu__label">ルーム</p>
                <p className="game-menu__code">{roomCode}</p>
              </div>
              <button type="button" className="game-menu__close" onClick={onClose}>
                閉じる
              </button>
            </div>

            <div className="game-menu__actions">
              {showAdvanceCpu && onAdvanceCpu && (
                <button type="button" className="game-menu__advance" onClick={onAdvanceCpu}>
                  CPUを進める ▶
                </button>
              )}
              {showCpuSpeed && onCycleCpuSpeed && cpuSpeedLabel && (
                <button type="button" className="secondary" onClick={onCycleCpuSpeed}>
                  CPU速度: {cpuSpeedLabel}
                </button>
              )}
              <button type="button" className="secondary" onClick={() => setEffectsOpen(true)}>
                カード効果一覧
              </button>
              {showLeave && (
                <button type="button" className="secondary game-menu__leave" onClick={onLeave}>
                  ルームを退出
                </button>
              )}
            </div>

            {children && <div className="game-menu__extra">{children}</div>}
          </div>
        </div>
      )}
      <CardEffectsModal open={effectsOpen} onClose={() => setEffectsOpen(false)} />
    </>
  );
}

export function GameMenuButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      className="game-topbar__menu-btn"
      aria-label="メニューを開く"
      onClick={onClick}
    >
      ☰
    </button>
  );
}
