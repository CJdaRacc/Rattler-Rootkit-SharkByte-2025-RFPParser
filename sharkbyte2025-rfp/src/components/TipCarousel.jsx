import { useEffect, useMemo, useRef, useState } from 'react';

/**
 * TipCarousel — a lightweight rotating tips banner for the RFP Parser page
 * - Rotates through provided tips every `rotateMs`
 * - Stays visible for `lifetimeMs` then auto-hides
 * - Pauses rotation on hover or focus
 * - Optional close button; ESC to close
 */
export default function TipCarousel({
  tips = [],
  rotateMs = 6000,
  lifetimeMs = 90_000,
  showClose = true,
  storageKey = null, // e.g., 'sb_rfp_tip_seen' to remember dismissal in sessionStorage
  className = '',
  variant = 'fixed', // 'fixed' | 'inline'
}){
  const validTips = useMemo(() => tips.filter(Boolean).map(t => String(t).trim()).filter(Boolean), [tips]);
  const [visible, setVisible] = useState(() => {
    if (!storageKey) return true;
    try { return sessionStorage.getItem(storageKey) ? false : true; } catch { return true; }
  });
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const rotateRef = useRef(null);
  const lifeRef = useRef(null);
  const rootRef = useRef(null);

  useEffect(() => {
    if (!visible || validTips.length === 0) return;

    // Rotation timer
    rotateRef.current = setInterval(() => {
      if (!paused) {
        setIndex(prev => (prev + 1) % validTips.length);
      }
    }, Math.max(2000, rotateMs));

    // Lifetime timer
    lifeRef.current = setTimeout(() => {
      closeBanner();
    }, Math.max(3000, lifetimeMs));

    return () => {
      if (rotateRef.current) clearInterval(rotateRef.current);
      if (lifeRef.current) clearTimeout(lifeRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, validTips.length, rotateMs, lifetimeMs, paused]);

  useEffect(() => {
    // Keyboard: ESC to close
    function onKey(e){
      if (e.key === 'Escape') closeBanner();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  function closeBanner(){
    setVisible(false);
    try { if (storageKey) sessionStorage.setItem(storageKey, '1'); } catch {}
    if (rotateRef.current) clearInterval(rotateRef.current);
    if (lifeRef.current) clearTimeout(lifeRef.current);
  }

  if (!visible || validTips.length === 0) return null;

  const current = validTips[index % validTips.length];

  return (
    <div
      ref={rootRef}
      className={`tip-carousel ${variant === 'inline' ? 'inline' : ''} ${className}`}
      role="region"
      aria-label="RFP authoring tip"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div className="tip-inner" tabIndex={0} onFocus={() => setPaused(true)} onBlur={() => setPaused(false)}>
        <span className="tip-badge" aria-hidden>Tip</span>
        <span className="tip-text" role="status" aria-live="polite">{current}</span>
        {showClose && (
          <button className="tip-close" aria-label="Dismiss tips" onClick={closeBanner}>
            ×
          </button>
        )}
      </div>
      {variant !== 'inline' && (
        <div className="tip-progress" aria-hidden>
          <div
            className="tip-progress-bar"
            style={{
              animationDuration: `${Math.max(3000, lifetimeMs)}ms`,
            }}
          />
        </div>
      )}
    </div>
  );
}
