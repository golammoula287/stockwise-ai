import { useEffect, useState } from 'react';

const slides = [
  { label: 'Overview', image: 'dashboard-preview.png', alt: 'Dashboard showing sales metrics and recent transactions' },
  { label: 'Inventory', image: 'inventory-preview.png', alt: 'Product inventory with stock levels and low-stock labels' },
  { label: 'Insights', image: 'insights-preview.png', alt: 'Demand forecasts and restock suggestions' },
];

export default function ProductGallery({ compact = false, autoPlay = true }) {
  const [active, setActive] = useState(0);
  const [previous, setPrevious] = useState(0);
  const [ready, setReady] = useState([false, false, false]);
  const [playing, setPlaying] = useState(autoPlay);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [reduced, setReduced] = useState(true);
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduced(media.matches);
    const visibility = () => setVisible(!document.hidden);
    update(); visibility();
    media.addEventListener('change', update);
    document.addEventListener('visibilitychange', visibility);
    return () => { media.removeEventListener('change', update); document.removeEventListener('visibilitychange', visibility); };
  }, []);
  useEffect(() => {
    if (!playing || reduced || hovered || focused || !visible || !ready.every(Boolean)) return;
    const timer = setInterval(() => { setPrevious(active); setActive((active + 1) % slides.length); }, 6500);
    return () => clearInterval(timer);
  }, [playing, reduced, hovered, focused, visible, active, ready]);
  return (
    <div className={`landing-preview product-gallery ${compact ? 'product-gallery-compact' : ''}`} role="region" aria-roledescription="carousel" aria-label="StockWise product screenshots" onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)} onFocusCapture={() => setFocused(true)} onBlurCapture={event => { if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false); }}>
      <div className="landing-preview-bar"><span className="landing-window-dots" aria-hidden="true"><i /><i /><i /></span><span>StockWise workspace</span><span className="landing-preview-label">PRODUCT TOUR</span></div>
      <div className="landing-preview-tabs" role="group" aria-label="Choose product preview">{slides.map((item, index) => <button key={item.label} type="button" aria-pressed={active === index} disabled={!ready[index]} className={active === index ? 'is-active' : ''} onClick={() => { setPrevious(active); setActive(index); setPlaying(false); }}>{item.label}</button>)}</div>
      <div className="landing-preview-image product-gallery-stage" aria-live="off">{slides.map((item, index) => <img key={item.image} className={active === index ? 'gallery-image is-active' : previous === index ? 'gallery-image is-underlay' : 'gallery-image'} src={`/images/${item.image}`} onLoad={event => { event.currentTarget.decode().then(() => setReady(current => current.map((value, i) => i === index ? true : value))).catch(() => {}); }} alt={item.alt} aria-hidden={index !== active} width="1440" height="1000" fetchPriority={index === 0 ? 'high' : 'low'} />)}</div>
      <div className="landing-preview-caption"><span><span className="landing-status-dot" />Fictional sample data</span><div className="gallery-controls"><span aria-hidden="true">0{active + 1} / 03</span>{!reduced && <button type="button" aria-label={playing ? 'Pause product tour' : 'Play product tour'} onClick={() => setPlaying(value => !value)}>{playing ? 'Pause' : 'Play'}<span aria-hidden="true">{playing ? 'Ⅱ' : '▷'}</span></button>}</div></div>
    </div>
  );
}
