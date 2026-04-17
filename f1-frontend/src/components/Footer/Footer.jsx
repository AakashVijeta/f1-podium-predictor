import "./Footer.css";

export default function Footer() {
  const currentYear = new Date().getFullYear();
  return (
    <footer className="footer">
      <div className="footer-left">
        <picture>
          <source srcSet="/logo.avif" type="image/avif" />
          <source srcSet="/logo.webp" type="image/webp" />
          <img src="/logo.png" alt="F1 Logo" width="40" height="40" loading="lazy" decoding="async" />
        </picture>
        <div className="footer-divider" />
        <div className="footer-bar" />
        <div>
          <div className="footer-built">Built by</div>
          <div className="footer-name">Aakash Vijeta</div>
        </div>
      </div>
      <div className="footer-right">F1 Podium Predictor · {currentYear}</div>
    </footer>
  );
}