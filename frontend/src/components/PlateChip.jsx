export function PlateChip({ plate, confidence }) {
  const low = confidence != null && confidence < 0.8;
  return (
    <span className={`plate${plate ? "" : " low"}${low ? " low" : ""}`} title={confidence != null ? `${Math.round(confidence * 100)}% confidence` : undefined}>
      {plate || "UNREAD"}
    </span>
  );
}

export function Severity({ level }) {
  return <span className={`sev ${level || "low"}`}>{level || "low"}</span>;
}
