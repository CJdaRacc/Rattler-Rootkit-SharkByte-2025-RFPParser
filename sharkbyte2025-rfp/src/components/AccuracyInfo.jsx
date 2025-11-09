import { useEffect, useState } from 'react';

/**
 * AccuracyInfo — small inline container explaining how Accuracy is computed.
 * - Default visible on first load; can be collapsed/expanded.
 * - Dismiss persists for the session (sessionStorage) unless `storageKey` is null.
 */
export default function AccuracyInfo({ className = '', storageKey = 'sb_rfp_accuracy_info' }){
  const [open, setOpen] = useState(true);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    if (!storageKey) return;
    try {
      const dismissed = sessionStorage.getItem(storageKey + '_dismissed');
      const collapsed = sessionStorage.getItem(storageKey + '_collapsed');
      if (dismissed === '1') setHidden(true);
      if (collapsed === '1') setOpen(false);
    } catch {}
  }, [storageKey]);

  function toggle(){
    setOpen(v => {
      const nv = !v;
      try { if (storageKey) sessionStorage.setItem(storageKey + '_collapsed', nv ? '0' : '1'); } catch {}
      return nv;
    });
  }

  function dismiss(){
    setHidden(true);
    try { if (storageKey) sessionStorage.setItem(storageKey + '_dismissed', '1'); } catch {}
  }

  if (hidden) return null;

  return (
    <div className={`info-note ${className}`} role="note" aria-label="Accuracy rating explanation">
      <div className="info-head">
        <span className="info-icon" aria-hidden>ℹ️</span>
        <strong className="info-title">How Accuracy is calculated</strong>
        <div className="info-spacer" />
        <button className="info-link" onClick={toggle} aria-expanded={open} aria-controls="accuracy-info-body">
          {open ? 'Hide' : 'Learn more'}
        </button>
        <button className="info-close" onClick={dismiss} aria-label="Dismiss accuracy info">×</button>
      </div>
      {open && (
        <div id="accuracy-info-body" className="info-body">
          <ul>
            <li><strong>Category coverage</strong>: We detect official sections (e.g., Eligibility, Timeline, Submission & Compliance). Accuracy rises as more expected sections are present in your parsed requirements.</li>
            <li><strong>Reference guide aware</strong>: When available, we align expected sections to an official reference RFP (20‑09aa) for more realistic categories.</li>
            <li><strong>Keyword boost</strong>: A small bonus is applied when auto‑generated keywords are available, reflecting richer anchoring.</li>
            <li><strong>Critical section penalty</strong>: Accuracy is knocked down when critical sections are missing (e.g., Eligibility, Submission & Compliance, Timeline, Budget, Evaluation). Admins can tune which sections are critical and the penalty in environment settings.</li>
            <li><strong>Heuristic, not absolute</strong>: OCR quality and unusual formats can affect parsing. Use this as a quick gauge, not a final score.</li>
          </ul>
          <div style={{ marginTop: 8 }}>
            <div style={{ fontWeight: 700, marginBottom: 4 }}>What Low, Medium, and High mean</div>
            <ul style={{ marginTop: 4 }}>
              <li><strong>High</strong>: Must‑have or compliance‑critical items (often due‑date bound, mandatory forms, certifications, or contractual requirements).</li>
              <li><strong>Medium</strong>: Important for scoring and alignment (strengthens proposal quality, evaluation criteria fit, or execution clarity).</li>
              <li><strong>Low</strong>: Nice‑to‑have items that improve completeness or polish but are not strictly required.</li>
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
