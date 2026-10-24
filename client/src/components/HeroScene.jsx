import { useEffect, useState } from 'react';

const images = ['sales-report-hero-seamless.png', 'retail-hero-01.png', 'retail-hero-02.png'];

export default function HeroScene() {
  const [scene, setScene] = useState(0);
  const [ready, setReady] = useState([false, false, false]);
  const [previous, setPrevious] = useState(0);
  const [reduced, setReduced] = useState(true);
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const motion = () => setReduced(media.matches);
    const visibility = () => setVisible(!document.hidden);
    motion(); visibility();
    media.addEventListener('change', motion);
    document.addEventListener('visibilitychange', visibility);
    return () => { media.removeEventListener('change', motion); document.removeEventListener('visibilitychange', visibility); };
  }, []);
  useEffect(() => {
    if (reduced || !visible || !ready.every(Boolean)) return;
    const timer = setInterval(() => { setPrevious(scene); setScene((scene + 1) % images.length); }, 9000);
    return () => clearInterval(timer);
  }, [reduced, visible, ready, scene]);
  return <div className="hero-scenes">
    {images.map((image, index) => <img key={image} className={`hero-scene-photo ${scene === index ? 'is-active' : previous === index ? 'is-underlay' : ''}`} src={`/images/${image}`} alt="" aria-hidden="true" onLoad={event => { const image = event.currentTarget; image.decode().then(() => setReady(current => current.map((value, i) => i === index ? true : value))).catch(() => {}); }} fetchPriority={index === 0 ? 'high' : 'low'} decoding="async" />)}

  </div>;
}
