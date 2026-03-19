import "./Footer.css";

export default function Footer() {
  const currentYear = new Date().getFullYear();
  return (
    <div className="footer">
      <div className="footer-left">
        <img src="../public/logo.png" alt="F1 Logo" />
        <div className="footer-divider" />
        <div className="footer-bar" />
        <div>
          <div className="footer-built">Built by</div>
          <div className="footer-name">Aakash Vijeta</div>
        </div>
      </div>
      <div className="footer-right">F1 Podium Predictor · {currentYear}</div>
    </div>
  );
}