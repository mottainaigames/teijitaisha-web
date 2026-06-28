import type { ReactNode } from "react";
import { MOTTAINAI_HP_URL } from "./social-promo";

export type LegalPageId = "privacy" | "terms";

const ENACTED_DATE = "2026年6月28日";

export function readLegalPage(): LegalPageId | null {
  if (typeof window === "undefined") return null;
  const path = window.location.pathname.replace(/\/$/, "");
  if (path === "/privacy") return "privacy";
  if (path === "/terms") return "terms";
  return null;
}

export function navigateLegal(page: LegalPageId | null): void {
  const next = page ? `/${page}` : "/";
  window.history.pushState({}, "", next);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

interface LegalPageShellProps {
  title: string;
  children: ReactNode;
  onBack: () => void;
}

function LegalPageShell({ title, children, onBack }: LegalPageShellProps) {
  return (
    <div className="legal-page">
      <div className="card legal-page__card">
        <button type="button" className="secondary legal-page__back" onClick={onBack}>
          ← 戻る
        </button>
        <h1 className="legal-page__title">{title}</h1>
        <p className="legal-page__enacted">制定日: {ENACTED_DATE}</p>
        <div className="legal-page__body">{children}</div>
        <LegalFooterLinks className="legal-page__footer-links" />
      </div>
    </div>
  );
}

function LegalSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="legal-section">
      <h2>{title}</h2>
      {children}
    </section>
  );
}

export function PrivacyPolicyPage({ onBack }: { onBack: () => void }) {
  return (
    <LegalPageShell title="プライバシーポリシー" onBack={onBack}>
      <p>
        Mottainai Games（以下「当サークル」）は、ボードゲーム「定時退社」の Web
        版（以下「本サービス」）における利用者情報の取扱いについて、以下のとおり定めます。
      </p>

      <LegalSection title="1. 運営者">
        <p>
          運営者: Mottainai Games
          <br />
          公式サイト:{" "}
          <a href={MOTTAINAI_HP_URL} target="_blank" rel="noopener noreferrer">
            {MOTTAINAI_HP_URL}
          </a>
        </p>
      </LegalSection>

      <LegalSection title="2. 取得する情報">
        <p>本サービスは、アカウント登録なしで利用できます。取得し得る情報は次のとおりです。</p>
        <ul>
          <li>
            <strong>表示名</strong> — ルーム参加時に利用者が入力するニックネーム（最大20文字）
          </li>
          <li>
            <strong>ゲーム内データ</strong> — ルームコード、プレイヤー識別子、ゲーム進行に必要な状態
          </li>
          <li>
            <strong>端末内の保存情報</strong> — 再接続のため、ブラウザの sessionStorage
            にセッション情報（ルームコード、プレイヤー識別子、セッショントークン、表示名）を保存します
          </li>
          <li>
            <strong>技術情報</strong> — IP アドレス、ブラウザ種別、アクセス日時等（ホスティング事業者のログとして自動記録される場合があります）
          </li>
        </ul>
        <p>
          本サービスは、現時点で位置情報・連絡先・決済情報・広告用トラッキングを取得する機能は設けていません。
        </p>
      </LegalSection>

      <LegalSection title="3. 利用目的">
        <ul>
          <li>オンライン対戦の提供および再接続のため</li>
          <li>不正利用・過度なリクエストの防止のため</li>
          <li>障害調査、サービス品質の維持・改善のため</li>
        </ul>
      </LegalSection>

      <LegalSection title="4. 保存期間">
        <ul>
          <li>
            <strong>ゲームサーバー上のデータ</strong> — ルームはメモリ上で管理され、ルーム終了または一定時間の非活動後に削除されます。永続的なデータベースには保存しません。
          </li>
          <li>
            <strong>端末内（sessionStorage）</strong> — ブラウザのタブ／セッションが終了するまで、または利用者がデータを削除するまで保存されます。
          </li>
          <li>
            <strong>サーバー・CDN のログ</strong> — ホスティング事業者（Fly.io、Cloudflare
            等）のポリシーに従い、一定期間保存された後に削除されます。
          </li>
        </ul>
      </LegalSection>

      <LegalSection title="5. 第三者提供">
        <p>
          当サークルは、法令に基づく場合を除き、利用者情報を第三者に販売しません。本サービスの提供に必要な範囲で、以下の事業者に処理を委託します。
        </p>
        <ul>
          <li>Cloudflare, Inc. — フロントエンドの配信</li>
          <li>Fly.io — ゲームサーバー（WebSocket）のホスティング</li>
        </ul>
        <p>これらの事業者は、それぞれのプライバシーポリシーに従って情報を取り扱います。</p>
      </LegalSection>

      <LegalSection title="6. 安全管理">
        <p>
          通信は HTTPS / WSS により暗号化されます。ルーム参加にはルームコードおよびセッショントークンが必要です。ただし、インターネット上のサービスであるため、完全な安全性を保証するものではありません。
        </p>
      </LegalSection>

      <LegalSection title="7. 利用者による対応">
        <p>
          表示名に本名やメールアドレス等の個人を特定できる情報を入力しないことを推奨します。端末内のセッション情報は、ブラウザのサイトデータ削除により消去できます。
        </p>
      </LegalSection>

      <LegalSection title="8. 改定">
        <p>
          本ポリシーは、法令の変更やサービス内容の変更に応じて改定することがあります。重要な変更がある場合は、本サービス上で告知します。
        </p>
      </LegalSection>

      <LegalSection title="9. お問い合わせ">
        <p>
          本ポリシーに関するお問い合わせは、
          <a href={MOTTAINAI_HP_URL} target="_blank" rel="noopener noreferrer">
            Mottainai Games 公式サイト
          </a>
          よりご連絡ください。
        </p>
      </LegalSection>
    </LegalPageShell>
  );
}

export function TermsOfServicePage({ onBack }: { onBack: () => void }) {
  return (
    <LegalPageShell title="利用規約" onBack={onBack}>
      <p>
        本規約は、Mottainai Games（以下「当サークル」）が提供する「定時退社 Web
        版」（以下「本サービス」）の利用条件を定めるものです。本サービスを利用した時点で、本規約に同意したものとみなします。
      </p>

      <LegalSection title="1. サービス内容">
        <ul>
          <li>
            本サービスは、ボードゲーム「定時退社」のオンライン対戦を、ブラウザ上で無料提供するものです。
          </li>
          <li>
            本サービスは Mottainai Games による公式 Web 版です。ボードゲーム本体（物理版）とは別の提供形態です。
          </li>
          <li>
            実装都合により、ボードゲーム本体のルール・操作感と完全に一致しない場合があります。
          </li>
        </ul>
      </LegalSection>

      <LegalSection title="2. 利用条件">
        <ul>
          <li>利用者は、自己の責任において本サービスを利用するものとします。</li>
          <li>アカウント登録は不要です。ルームコードを用いて参加します。</li>
          <li>
            表示名には、第三者を誹謗中傷する内容、個人を特定できる情報、法令に反する内容、その他公序良俗に反する内容を入力しないでください。
          </li>
          <li>
            本サービスにチャット機能はありませんが、表示名や外部サービス（X 等）への共有内容についても、利用者自身の責任で行ってください。
          </li>
        </ul>
      </LegalSection>

      <LegalSection title="3. 禁止事項">
        <p>利用者は、以下の行為を行ってはなりません。</p>
        <ul>
          <li>サーバーへの不正アクセス、過度な負荷をかける行為、チート・改ざんの試み</li>
          <li>他の利用者への迷惑行為、なりすまし、荒らし</li>
          <li>本サービスの運営を妨害する行為</li>
          <li>当サークルまたは第三者の権利を侵害する行為</li>
          <li>その他、当サークルが不適切と判断する行為</li>
        </ul>
        <p>
          ホストは、ルーム内で他プレイヤーを追い出す機能を利用できます。当サークルは、必要に応じてサービス全体への利用制限等の対応を行うことがあります。
        </p>
      </LegalSection>

      <LegalSection title="4. 免責事項">
        <ul>
          <li>
            本サービスは現状有姿で提供されます。中断、遅延、データ消失、ルール実装上の差異等について、当サークルは故意または重過失がある場合を除き責任を負いません。
          </li>
          <li>
            メンテナンス、障害、ルームのタイムアウト等により、対戦中のデータが失われる場合があります。
          </li>
          <li>
            本サービス上の表現（「労基」「残業」等）はゲーム上のフィクションであり、現実の労働相談・法律相談の代替にはなりません。
          </li>
          <li>
            利用者間または利用者と第三者間のトラブルについて、当サークルは故意または重過失がある場合を除き関与しません。
          </li>
        </ul>
      </LegalSection>

      <LegalSection title="5. 知的財産">
        <p>
          本サービスに含まれるゲーム名称、ルール、カードデザイン、プログラム、文章、画像等の知的財産権は、当サークルまたは正当な権利者に帰属します。利用者は、当サークルの許諾なく複製、改変、再配布、商用利用してはなりません。
        </p>
      </LegalSection>

      <LegalSection title="6. 外部リンク">
        <p>
          本サービスから、Amazon、X（旧 Twitter）、当サークル公式サイト等の外部サイトへリンクする場合があります。外部サイトの利用は、各サイトの規約・ポリシーに従うものとし、当サークルは外部サイトの内容・サービスについて責任を負いません。
        </p>
      </LegalSection>

      <LegalSection title="7. サービスの変更・終了">
        <p>
          当サークルは、事前の告知なく、本サービスの内容変更、一時停止、終了を行うことがあります。
        </p>
      </LegalSection>

      <LegalSection title="8. 規約の変更">
        <p>
          本規約は、必要に応じて変更することがあります。変更後に本サービスを利用した場合、変更後の規約に同意したものとみなします。
        </p>
      </LegalSection>

      <LegalSection title="9. 準拠法・管轄">
        <p>
          本規約は日本法に準拠します。本サービスに関する紛争については、当サークルの所在地を管轄する裁判所を第一審の専属的合意管轄裁判所とします。
        </p>
      </LegalSection>

      <LegalSection title="10. お問い合わせ">
        <p>
          本規約に関するお問い合わせは、
          <a href={MOTTAINAI_HP_URL} target="_blank" rel="noopener noreferrer">
            Mottainai Games 公式サイト
          </a>
          よりご連絡ください。
        </p>
      </LegalSection>
    </LegalPageShell>
  );
}

interface LegalFooterLinksProps {
  className?: string;
}

export function LegalFooterLinks({ className = "" }: LegalFooterLinksProps) {
  return (
    <nav
      className={`legal-footer-links ${className}`.trim()}
      aria-label="プライバシーポリシーと利用規約"
    >
      <a
        href="/privacy"
        onClick={(e) => {
          e.preventDefault();
          navigateLegal("privacy");
        }}
      >
        プライバシーポリシー
      </a>
      <span className="legal-footer-links__sep" aria-hidden="true">
        ·
      </span>
      <a
        href="/terms"
        onClick={(e) => {
          e.preventDefault();
          navigateLegal("terms");
        }}
      >
        利用規約
      </a>
    </nav>
  );
}

export function LegalPageRouter({
  page,
  onBack,
}: {
  page: LegalPageId;
  onBack: () => void;
}) {
  if (page === "privacy") return <PrivacyPolicyPage onBack={onBack} />;
  return <TermsOfServicePage onBack={onBack} />;
}
