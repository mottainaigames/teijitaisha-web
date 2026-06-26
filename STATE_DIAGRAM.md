# 定時退社 — 状態遷移図（Web実装用）

> **参照:** `RULES_RECOGNITION.md`（確定ルール）
>
> **目的:** サーバー・クライアントの状態設計と EffectResolver の実装指針

---

## 1. 全体ライフサイクル

```mermaid
stateDiagram-v2
    direction LR

    [*] --> Lobby: ルーム作成/参加

    Lobby --> Seating: 人数3〜6で開始
    Seating --> Dealing: 座席確定\n(ランダム or ホスト指定)

    Dealing --> TurnLoop: 配布完了\n初手ランダム決定

    TurnLoop --> GameEnd: 終了条件成立
    GameEnd --> Result: 結果表示
    Result --> Lobby: リマッチ
    Result --> [*]: 退出

    note right of Seating
        座席順固定
        右隣/左隣を算出
    end note

    note right of Dealing
        49枚配布
        端数は初手からCW
        開始時ペアは捨て不可
    end note
```

---

## 2. ゲーム終了判定（TurnLoop からの分岐）

```mermaid
stateDiagram-v2
    direction TB

    state TurnLoop {
        [*] --> ActiveTurn
        ActiveTurn --> ActiveTurn: 次の在籍者へ\n(時計回り)
    }

    TurnLoop --> CheckEnd: ターン完了後

    CheckEnd --> GameEnd_Normal: 在籍者が1人のみ
    CheckEnd --> TurnLoop: 在籍者2人以上

    state GameEnd {
        [*] --> GameEnd_Normal
        [*] --> GameEnd_Rouki
    }

    GameEnd_Normal: 通常終了\n残業保持者が敗北
    GameEnd_Rouki: 労基摘発\n残業公開→即終了

    note right of GameEnd_Rouki
        労基効果中に遷移
        退社判定を挟まない
    end note
```

| 終了パターン | トリガー                    | 結果                                                    |
| ------------ | --------------------------- | ------------------------------------------------------- |
| **通常終了** | 在籍プレイヤーが1人になった | 退社済み=勝者（順位あり）、残り1人=敗者（残業保持）     |
| **労基摘発** | 労基で「残業」が公開        | 労基使用者=大勝利、残業保持者=大敗北、退社済み=共同責任 |

---

## 3. 1ターンの状態遷移

```mermaid
stateDiagram-v2
    direction TB

    [*] --> TurnStart

    TurnStart --> DrawPhase: 現プレイヤー=在籍者
    TurnStart --> NextPlayer: 現プレイヤー=退社済み\n(スキップ)

    DrawPhase --> DrawWait: 右隣(在籍)から1枚引く
    DrawWait --> DrawDone: 選択 or 20秒ランダム

    DrawDone --> PlayPrompt: 飲み会デバフなし
    DrawDone --> TurnEnd: 飲み会デバフあり\n(ペア放出不可)

    PlayPrompt --> EffectResolve: ペアを出す
    PlayPrompt --> TurnEnd: 出さない(スキップ)\nor 出せるペアなし

    EffectResolve --> PlayPrompt: エナドリ残あり\n(追加ペア可能)
    EffectResolve --> PostEffect: ペア放出完了

    PostEffect --> CheckRetire: 効果解決完了
    CheckRetire --> TurnEnd: 退社者なし or 退社処理済み
    CheckRetire --> CheckRetire: 0枚→退社マーク\n(複数同時可)

    TurnEnd --> CheckGameEnd
    CheckGameEnd --> [*]: 継続
    CheckGameEnd --> GameEnd: 在籍1人

    note right of DrawPhase
        右隣が退社済みなら
        さらに右(在籍)へ
    end note

    note right of PlayPrompt
        pairsRemaining = 1 + enadoriStack
        飲み会中はスキップ
    end note
```

### ターン内の状態変数（実装用）

| 変数              | 説明                                                     |
| ----------------- | -------------------------------------------------------- |
| `currentPlayerId` | 手番のプレイヤー                                         |
| `nomikaiBlocked`  | 飲み会によりペア放出不可（次の1ターンのみ）              |
| `pairsRemaining`  | このターンにまだ出せるペア数（初期値1、エナドリで+1/回） |
| `enadoriStack`    | エナドリのスタック数（上限なし）                         |
| `phase`           | `draw` \| `play` \| `effect`                             |

---

## 4. 効果解決（EffectResolve）のサブ状態

カード1組を場に出したあと、`phase = effect` に入り、カード種別ごとにサブフローが分岐する。

```mermaid
stateDiagram-v2
    direction TB

    [*] --> DiscardPair: ペアを場へ

    DiscardPair --> Branch: カード種別で分岐

    Branch --> NoEffect: ノルマ
    Branch --> SelectTarget: 労基/社内恋愛/新人教育/\n取引/パワハラ
    Branch --> NomikaiFlag: 飲み会
    Branch --> InfoShare: 情報共有
    Branch --> EnadoriInc: エナドリ
    Branch --> Meeting: 会議
    Branch --> TabacoAll: タバコ休憩

    NoEffect --> [*]
    NomikaiFlag --> [*]: nextPlayer.nomikaiBlocked=true
    EnadoriInc --> [*]: pairsRemaining++

    SelectTarget --> AutoTarget: 有効対象が1人
    SelectTarget --> TargetWait: 複数候補
    AutoTarget --> ResolveTarget
    TargetWait --> ResolveTarget: 選択 or ランダム

    ResolveTarget --> RoukiReveal: 労基
    ResolveTarget --> RomanceView: 社内恋愛
    ResolveTarget --> Training: 新人教育
    ResolveTarget --> Trade: 取引
    ResolveTarget --> PowerHarass: パワハラ

    RoukiReveal --> RoukiNormal: 残業/パワハラ以外
    RoukiReveal --> GameEnd_Rouki: 残業公開
    RoukiReveal --> PowerHarassRouki: パワハラ公開\n→労基使用者へ移動
    RoukiNormal --> [*]: 公開→手札に戻す
    PowerHarassRouki --> [*]

    RomanceView --> [*]: 2人だけ全手札表示
    Training --> [*]: 見る(最大2)→加える(任意)
    Trade --> TradeWait: 双方カード選択
    TradeWait --> [*]: 同時交換
    PowerHarass --> [*]: 1枚渡す

    InfoShare --> InfoShareWait: 全在籍者が1枚選択
    InfoShareWait --> [*]: 一斉に左隣へ

    Meeting --> MeetingDeclare: 残業保持者に強制宣言
    MeetingDeclare --> [*]

    TabacoAll --> [*]: タバコ休憩を全員同時に場へ

    note right of DiscardPair
        効果完了後に
        checkRetirement()
        を呼ぶ
    end note
```

### 効果解決の共通パイプライン

```
playPair(cardType)
  → runEffect(cardType)     // 上記サブフロー
  → checkRoukiGameEnd()      // 残業公開時のみ即終了
  → checkRetirement()        // 全在籍者の手札==0 → 退社
  → if pairsRemaining > 0 → PlayPrompt へ
  → else → TurnEnd へ
```

---

## 5. カード効果ごとの遷移一覧

| カード     | 入力待ち状態                       | 解決                      | 特殊終了         |
| ---------- | ---------------------------------- | ------------------------- | ---------------- |
| ノルマ     | なし                               | 即完了                    | —                |
| 労基       | 対象PL + カード選択                | 公開→戻す or パワハラ移動 | 残業→**GameEnd** |
| 飲み会     | なし                               | 次PLに`nomikaiBlocked`    | —                |
| 社内恋愛   | 対象PL選択                         | 2人に全手札表示           | —                |
| 新人教育   | 対象PL + 見るカード + 加える(任意) | 移動 or スキップ          | —                |
| 情報共有   | **全在籍者**が1枚選択              | 一斉に左隣へ              | —                |
| 取引       | 対象PL + **双方**カード選択        | 同時交換                  | —                |
| エナドリ   | なし                               | `pairsRemaining++`        | —                |
| 会議       | 残業保持者の強制宣言               | 宣言表示                  | —                |
| パワハラ   | 対象PL + 渡すカード                | 1枚移動                   | —                |
| タバコ休憩 | なし（自動）                       | 全員のタバコ休憩を場へ    | —                |

---

## 6. プレイヤー状態

```mermaid
stateDiagram-v2
    direction LR

    [*] --> InLobby
    InLobby --> Active: ゲーム開始
    Active --> Active: 手番/効果対象
    Active --> Retired: 手札0枚\n(効果完了後判定)
    Active --> Disconnected: 切断
    Disconnected --> Active: 再接続
    Disconnected --> Disconnected: ランダム代行継続
    Retired --> Spectating: 退社後
    Spectating --> InLobby: ゲーム終了
    Active --> InLobby: ゲーム終了
```

| 状態           | 手札 | 手番 | 効果の対象 | 情報共有 |
| -------------- | ---- | ---- | ---------- | -------- |
| `active`       | あり | ○    | ○          | ○        |
| `retired`      | 0枚  | ×    | ×          | ×        |
| `disconnected` | あり | 代行 | 代行       | 代行     |

---

## 7. 入力待ちとタイムアウト（20秒）

```mermaid
stateDiagram-v2
    direction TB

    [*] --> WaitingInput

    WaitingInput --> PlayerAction: プレイヤー操作
    WaitingInput --> AutoRandom: 20秒経過\nor 切断中

    PlayerAction --> Resolved
    AutoRandom --> Resolved: ランダム可能
    AutoRandom --> Resolved: ランダム不可\n(スキップ/強制処理)

    Resolved --> [*]

    note right of AutoRandom
        会議→強制宣言
        対象1人→自動
        任意ペアなし→スキップ
    end note
```

| 待ち状態 ID            | 待つ人      | タイムアウト                            |
| ---------------------- | ----------- | --------------------------------------- |
| `WAIT_DRAW`            | 手番PL      | 右隣からランダムに1枚                   |
| `WAIT_PLAY_OR_SKIP`    | 手番PL      | ペアあればランダム1組、なければスキップ |
| `WAIT_SELECT_TARGET`   | 効果使用者  | 有効対象からランダム                    |
| `WAIT_SELECT_CARD`     | 効果使用者  | 候補からランダム                        |
| `WAIT_INFO_SHARE`      | 全在籍者    | 未選択者はランダム                      |
| `WAIT_TRADE_BOTH`      | 使用者+対象 | 未選択はランダム                        |
| `WAIT_TRAINING_TAKE`   | 効果使用者  | 加える/加えないをランダム               |
| `WAIT_MEETING_DECLARE` | 残業保持者  | 強制宣言（即時）                        |

---

## 8. サーバー `GameState` 推奨スキーマ

```typescript
type GamePhase = "lobby" | "dealing" | "draw" | "play" | "effect" | "game_end";

type EffectStep =
  | "none"
  | "select_target"
  | "select_card"
  | "reveal"
  | "info_share"
  | "trade"
  | "training"
  | "meeting_declare"
  | "tabaco_dump";

interface GameState {
  phase: GamePhase;
  effectStep: EffectStep;
  effectCard: CardType | null;

  seats: PlayerId[]; // 円形座席順（index 0..n-1）
  currentSeatIndex: number;
  firstPlayerSeatIndex: number;

  players: Record<
    PlayerId,
    {
      status: "active" | "retired" | "disconnected";
      hand: CardInstance[];
    }
  >;

  discardPile: CardInstance[];
  pairsRemainingThisTurn: number;
  nomikaiBlockedPlayerId: PlayerId | null;

  pendingInput: {
    type: string;
    playerIds: PlayerId[];
    deadlineAt: number | null; // 20秒アイドル検知用
  } | null;

  result: GameResult | null;
}
```

---

## 9. 退社判定の呼び出しタイミング

```mermaid
flowchart TD
    A[効果/ターン処理ブロック完了] --> B{労基で残業公開?}
    B -->|Yes| C[GameEnd 労基摘発]
    B -->|No| D[全在籍PLの手札枚数チェック]
    D --> E{0枚のPLあり?}
    E -->|Yes| F[該当PLを retired に]
    E -->|No| G[続行]
    F --> H{在籍PL数}
    H -->|1人| I[GameEnd 通常終了]
    H -->|2人以上| G
    G --> J[次の処理へ]
```

**重要:** 効果の途中（カード移動中・情報共有の交換前など）では `checkRetirement()` を呼ばない。

---

## 10. エナドリ + 複数ペアのターン内ループ

```mermaid
flowchart TD
    Start[ターン開始\npairsRemaining=1] --> Draw[DrawPhase]
    Draw --> Play{ペアを出す?}
    Play -->|No| EndTurn[TurnEnd]
    Play -->|Yes| Effect[EffectResolve]
    Effect --> Ena{エナドリ?}
    Ena -->|Yes| Inc[pairsRemaining++]
    Ena -->|No| Check
    Inc --> Check[checkRetirement]
    Check --> More{pairsRemaining > 0\nかつ 出せるペアあり\nかつ nomikaiBlocked=false?}
    More -->|Yes| Play
    More -->|No| EndTurn
```

---

## 11. 隣の算出（座席）

```
seatIndex: 0 .. n-1（円形）

rightOf(i) = seats[(i + 1) % n]
leftOf(i)  = seats[(i - 1 + n) % n]

nextActiveSeat(i):
  j = (i + 1) % n
  while players[seats[j]].status == "retired":
    j = (j + 1) % n
  return j

drawSourceSeat(i):
  j = rightOf(i)
  while players[seats[j]].status != "active":
    j = rightOf(indexOf(seats[j]))
  return j
```

---

## 12. 実装チェックリスト

- [ ] `phase` / `effectStep` / `pendingInput` の3層で状態を表現
- [ ] 効果完了後のみ `checkRetirement()` を呼ぶ
- [ ] 労基×残業は `checkRetirement()` より先に `GameEnd` へ
- [ ] 飲み会は `nomikaiBlockedPlayerId` を次ターン1回だけ立てる
- [ ] 情報共有・取引は複数PLの `pendingInput` を並行管理
- [ ] 20秒アイドル・切断は同一の `AutoRandom` パスを通す
- [ ] 対象1人のとき `WAIT_SELECT_TARGET` をスキップ
- [ ] 退社済みPLは全効果の対象外（タバコ休憩・情報共有も除外）

---

_作成日: 2026-06-25_
_参照: RULES_RECOGNITION.md_
