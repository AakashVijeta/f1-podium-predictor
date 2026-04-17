import { memo } from "react";
import "./SectionHeader.css";

function SectionHeader({ label, sub }) {
  return (
    <div className="sh" key={label}>
      <div className="sh-bar" />
      <div className="sh-lbl">{label}</div>
      <div className="sh-line" />
      {sub && <div className="sh-sub">{sub}</div>}
    </div>
  );
}

export default memo(SectionHeader);
