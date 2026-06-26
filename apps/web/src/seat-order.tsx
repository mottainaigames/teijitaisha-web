import { Fragment } from "react";

interface Seat {
  playerId: string;
  name: string;
  status: "active" | "retired" | "disconnected";
  seatIndex: number;
}

interface Props {
  seats: Seat[];
  currentPlayerId: string | null;
  drawSourcePlayerId?: string | null;
  myPlayerId: string;
}

export function SeatOrderBar({
  seats,
  currentPlayerId,
  drawSourcePlayerId,
  myPlayerId,
}: Props) {
  const sorted = [...seats].sort((a, b) => a.seatIndex - b.seatIndex);
  if (sorted.length === 0) return null;

  return (
    <div className="seat-order">
      <p className="seat-order__title">プレイ順（左隣から引く）</p>
      <div className="seat-order__track">
        {sorted.map((seat, i) => {
          const isCurrent = seat.playerId === currentPlayerId;
          const isMe = seat.playerId === myPlayerId;
          const isRetired = seat.status === "retired";
          const prev = sorted[i - 1];
          const showDrawHint =
            !!drawSourcePlayerId &&
            !!currentPlayerId &&
            prev?.playerId === drawSourcePlayerId &&
            seat.playerId === currentPlayerId;

          return (
            <Fragment key={seat.playerId}>
              {i > 0 && (
                <span
                  className={`seat-order__arrow${showDrawHint ? " seat-order__arrow--draw" : ""}`}
                  aria-hidden
                >
                  {showDrawHint ? "←引く" : "→"}
                </span>
              )}
              <div
                className={[
                  "seat-order__seat",
                  isCurrent ? "seat-order__seat--current" : "",
                  isRetired ? "seat-order__seat--retired" : "",
                  isMe ? "seat-order__seat--me" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
              >
                <span className="seat-order__index">{seat.seatIndex + 1}</span>
                <span className="seat-order__name">{seat.name}</span>
                {isCurrent && <span className="seat-order__badge">手番</span>}
              </div>
            </Fragment>
          );
        })}
        {sorted.length > 1 && (
          <span className="seat-order__wrap" aria-label="順番は一周する">
            ↺
          </span>
        )}
      </div>
    </div>
  );
}
