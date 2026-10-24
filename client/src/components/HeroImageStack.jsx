import { useEffect, useState } from 'react';

const slides = [
  { image: 'dashboard-preview.png', title: 'Sales overview', alt: 'Sales dashboard with revenue and recent transactions' },
  { image: 'inventory-preview.png', title: 'Inventory', alt: 'Inventory with products, stock quantities, and low-stock alerts' },
  { image: 'invoice-preview.png', title: 'Sales & invoices', alt: 'Sales workspace displaying a saved invoice' },
  { image: 'customers-preview.png', title: 'Customers', alt: 'Customer records and purchase history' },
  { image: 'insights-preview.png', title: 'Demand insights', alt: 'Product sales comparison chart and slow-moving inventory in the current demo' },
];

export default function HeroImageStack() {
  const [active, setActive] = useState(0);
  const [ready, setReady] = useState({});
  const [paused, setPaused] = useState(false);
  const [reduced, setReduced] = useState(true);
  useEffect(() => {
    const media = matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduced(media.matches);
    update(); media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  useEffect(() => {
    if (paused || reduced || !slides.every((_, index) => ready[index])) return;
    const timer = setInterval(() => { if (!document.hidden) setActive(value => (value + 1) % slides.length); }, 5000);
    return () => clearInterval(timer);
  }, [paused, reduced, ready]);
  return <div className="hero-image-stack" role="region" aria-roledescription="carousel" aria-label="Workspace image stack" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} onFocusCapture={() => setPaused(true)} onBlurCapture={event => { if (!event.currentTarget.contains(event.relatedTarget)) setPaused(false); }}>
    <div className="hero-stack-stage">{slides.map((slide, index) => <figure key={slide.image} className={`hero-stack-card stack-position-${Math.min((index - active + slides.length) % slides.length, 3)}`} aria-hidden={index !== active}><div className="hero-inventory-caption"><span>{slide.title}</span><span>StockWise AI</span></div><img src={`/images/${slide.image}`} alt={slide.alt} width="1440" height="1000" onLoad={event => { event.currentTarget.decode().then(() => setReady(value => ({ ...value, [index]: true }))).catch(() => {}); }} /></figure>)}</div>
  </div>;
}
