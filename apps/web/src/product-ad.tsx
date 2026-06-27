export const PRODUCT_AD_URL = "https://www.amazon.co.jp/dp/B0H2ZV2QBJ";
export const PRODUCT_AD_IMAGE = "/promo/teijitaisha-box.png";

interface ProductAdBannerProps {
  className?: string;
}

export function ProductAdBanner({ className = "" }: ProductAdBannerProps) {
  return (
    <a
      className={`product-ad-banner ${className}`.trim()}
      href={PRODUCT_AD_URL}
      target="_blank"
      rel="noopener noreferrer"
    >
      <img className="product-ad-banner__img" src={PRODUCT_AD_IMAGE} alt="定時退社 ボードゲーム" />
      <span className="product-ad-banner__text">
        <span className="product-ad-banner__headline">累計1万部突破！</span>
        <span className="product-ad-banner__body">ボードゲーム「定時退社」発売中</span>
        <span className="product-ad-banner__cta">Amazonで見る →</span>
      </span>
    </a>
  );
}

interface ProductAdPopupProps {
  onClose: () => void;
}

export function ProductAdPopup({ onClose }: ProductAdPopupProps) {
  return (
    <div className="product-ad-popup" role="dialog" aria-modal="true" aria-label="定時退社 発売のお知らせ">
      <button type="button" className="product-ad-popup__close" onClick={onClose} aria-label="閉じる">
        ×
      </button>
      <a
        className="product-ad-popup__link"
        href={PRODUCT_AD_URL}
        target="_blank"
        rel="noopener noreferrer"
      >
        <img className="product-ad-popup__img" src={PRODUCT_AD_IMAGE} alt="定時退社 ボードゲーム" />
        <p className="product-ad-popup__headline">累計1万部突破！</p>
        <p className="product-ad-popup__body">ボードゲーム「定時退社」発売中</p>
        <span className="product-ad-popup__cta">Amazonで見る →</span>
      </a>
    </div>
  );
}
