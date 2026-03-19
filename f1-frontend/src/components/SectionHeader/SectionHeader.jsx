import "./SectionHeader.css";

export default function SectionHeader({ label, sub }) {
  return (
    <div className="sh">
      <div className="sh-bar" />
      <div className="sh-lbl">{label}</div>
      <div className="sh-line" />
      {sub && <div className="sh-sub">{sub}</div>}
    </div>
  );
}
