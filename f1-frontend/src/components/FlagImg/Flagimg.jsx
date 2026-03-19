import "./FlagImg.css";

export default function FlagImg({ code, size = "m", className = "" }) {
  if (!code) return null;
  return (
    <img
      className={`flag-img flag-${size} ${className}`}
      src={`https://flagcdn.com/${code.toLowerCase()}.svg`}
      alt={code}
      loading="lazy"
    />
  );
}