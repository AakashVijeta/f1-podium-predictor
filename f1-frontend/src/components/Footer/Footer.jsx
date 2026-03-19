import "./Footer.css";
import f1Logo from "../../../public/logo.png";

export default function Footer() {
  const currentYear = new Date().getFullYear();
  return (
    <div className="footer">
      <div className="footer-left">
        <img src={f1Logo} alt="F1 Logo" />
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