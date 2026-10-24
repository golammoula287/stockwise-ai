import Brand from '../components/Brand';
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import HeroImageStack from '../components/HeroImageStack';
import HeroScene from '../components/HeroScene';

function Icon({ name, ...props }) {
  const paths = {
    box: 'm12 3 9 5-9 5-9-5 9-5Zm-9 5v9l9 5 9-5V8M12 13v9M7.5 5.5l9 5',
    sale: 'M8 3h8v4H8zM6 5H4v16h16V5h-2M8 12h8m-8 4h5',
    chart: 'M4 3v17h17M8 14l4-4 4 2 5-7',
    menu: 'M4 7h16M4 12h16M4 17h16',
    close: 'm6 6 12 12M6 18 18 6',
  };
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}><path d={paths[name]} /></svg>;
}


export default function Home() {
  const [divider,setDivider]=useState(null);
  const [mobileMenu, setMobileMenu] = useState(false);
  const [activeSection, setActiveSection] = useState('#top');
  const [headerScrolled, setHeaderScrolled] = useState(false);
  const rootRef = useRef(null);
  const menuButtonRef = useRef(null);
  const contactMessage = 'Hi, I’d like to learn more about StockWise AI and arrange a demo.';
  const whatsappUrl = `https://wa.me/8801708084799?text=${encodeURIComponent(contactMessage)}`;
  const emailUrl = `mailto:golammoula287@gmail.com?subject=${encodeURIComponent('StockWise AI — Demo inquiry')}&body=${encodeURIComponent(contactMessage)}`;

  useEffect(() => {
    const root=rootRef.current;
    const hero=root?.querySelector('.landing-hero');
    const showcase=root?.querySelector('.hero-stack-stage');
    if(!hero || !showcase)return;
    const fit=()=>{
      if(innerWidth<900){setDivider(null);return;}
      const area=hero.getBoundingClientRect(), image=showcase.getBoundingClientRect();
      const w=area.width, h=Math.max(65,area.bottom-image.bottom+1), anchor=image.left-area.left+image.width/2;
      setDivider({height:h,viewBox:`0 0 ${w} ${h}`,path:`M0 ${h-9} C${w*.09} ${h-23} ${w*.15} ${h-2} ${w*.23} ${h*.88} C${w*.31} ${h*.72} ${w*.35} ${h*.67} ${w*.42} ${h*.67} C${w*.53} ${h*.67} ${anchor*.79} 0 ${anchor} 0 C${anchor+(w-anchor)*.33} 0 ${w*.9} ${h*.17} ${w} ${h*.07} V${h} H0 Z`});
    };
    fit();
    const observer=new ResizeObserver(fit);observer.observe(hero);observer.observe(showcase);
    window.addEventListener('resize',fit);
    return()=>{observer.disconnect();window.removeEventListener('resize',fit);};
  }, []);

  useEffect(() => {
    const root = rootRef.current;
    if (!root || !('IntersectionObserver' in window) || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    root.dataset.motion = 'ready';
    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -35px 0px' });
    root.querySelectorAll('.landing-reveal').forEach(el => observer.observe(el));
    return () => { observer.disconnect(); delete root.dataset.motion; };
  }, []);

  useEffect(() => {
    if (!mobileMenu) return;
    const closeOnEscape = event => {
      if (event.key === 'Escape') { setMobileMenu(false); menuButtonRef.current?.focus(); }
    };
    const desktop = window.matchMedia('(min-width: 900px)');
    const closeOnDesktop = event => { if (event.matches) setMobileMenu(false); };
    window.addEventListener('keydown', closeOnEscape);
    desktop.addEventListener('change', closeOnDesktop);
    return () => { window.removeEventListener('keydown', closeOnEscape); desktop.removeEventListener('change', closeOnDesktop); };
  }, [mobileMenu]);

  useEffect(() => {
    let frame = null;
    const updateSection = () => {
      frame = null;
      let current = '#top';
      const activationLine = Math.min(window.innerHeight * 0.35, 200);
      for (const id of ['features', 'about', 'contact']) {
        if (document.getElementById(id)?.getBoundingClientRect().top <= activationLine) current = `#${id}`;
      }
      // The contact anchor can hit the bottom scroll limit before reaching the activation line.
      if (window.scrollY > 0 && window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 2) current = '#contact';
      setActiveSection(current);
      setHeaderScrolled(window.scrollY > 24);
      const scrollRange = document.documentElement.scrollHeight - window.innerHeight;
      rootRef.current?.style.setProperty('--page-progress', String(scrollRange > 0 ? Math.min(1, Math.max(0, window.scrollY / scrollRange)) : 0));
    };
    const scheduleUpdate = () => {
      if (frame === null) frame = window.requestAnimationFrame(updateSection);
    };
    updateSection();
    window.addEventListener('scroll', scheduleUpdate, { passive: true });
    window.addEventListener('resize', scheduleUpdate);
    window.addEventListener('hashchange', scheduleUpdate);
    return () => {
      window.removeEventListener('scroll', scheduleUpdate);
      window.removeEventListener('resize', scheduleUpdate);
      window.removeEventListener('hashchange', scheduleUpdate);
      if (frame !== null) window.cancelAnimationFrame(frame);
    };
  }, []);

  const navigation = [['#top', 'Home'], ['#features', 'Features'], ['#about', 'How it works'], ['#contact', 'Contact']];

  return (
    <div className="landing landing-photographic" ref={rootRef} id="top">
      <a className="landing-skip" href="#main-content">Skip to content</a>
      <header className={`landing-header ${headerScrolled || mobileMenu ? 'is-scrolled' : ''}`}>
        <nav className="landing-container landing-nav" aria-label="Main navigation">
          <Link to="/" aria-label="StockWise AI home"><Brand /></Link>
          <div className="landing-desktop-nav">{navigation.map(([href, label]) => <a key={href} href={href} className="landing-section-link" aria-current={activeSection === href ? 'location' : undefined} onClick={() => setActiveSection(href)}>{label}</a>)}</div>
          <div className="landing-desktop-nav"><Link to="/login">Log in</Link><Link className="landing-button landing-button-small" to="/login">Get started</Link></div>
          <button ref={menuButtonRef} className="landing-menu-button" aria-label={mobileMenu ? 'Close menu' : 'Open menu'} aria-expanded={mobileMenu} aria-controls="home-mobile-menu" onClick={() => setMobileMenu(v => !v)}><Icon name={mobileMenu ? 'close' : 'menu'} /></button>
        </nav>
        {mobileMenu && <nav id="home-mobile-menu" className="landing-mobile-nav landing-container" aria-label="Mobile navigation">{navigation.map(([href, label]) => <a key={href} href={href} className="landing-section-link" aria-current={activeSection === href ? 'location' : undefined} onClick={() => { setActiveSection(href); setMobileMenu(false); }}>{label}</a>)}<Link to="/login" onClick={() => setMobileMenu(false)}>Get started</Link></nav>}
      </header>

      <main id="main-content">
        <section className="landing-hero" aria-labelledby="hero-title">
          <HeroScene />
          <div className="landing-container landing-hero-inner">
            <div className="landing-hero-copy landing-enter">
              <p className="landing-eyebrow">A LITTLE CLARITY GOES A LONG WAY</p>
              <h1 id="hero-title">Keep your stock clear.<br />And your day moving.</h1>
              <p className="landing-intro">Your inventory, checkout, and customer history. Thoughtfully connected.</p>
              <div className="hero-professional-actions"><Link to="/login" className="landing-button">Get started</Link><a href="#features">Explore the features</a></div>
              <p className="landing-demo-note">Independent portfolio project. Fictional sample data.</p>
            </div>
          </div>
          <HeroImageStack />
          <svg className="hero-curve-divider" style={divider?{height:divider.height}:undefined} viewBox={divider?.viewBox || "0 0 1440 80"} preserveAspectRatio="none" aria-hidden="true" focusable="false"><path d={divider?.path || "M0 62C120 42 180 78 300 58S480 24 600 46S780 72 900 40S1080 12 1200 30S1350 38 1440 12V80H0Z"} fill="white" /></svg>
        </section>

        <section id="features" className="landing-section landing-container" aria-labelledby="features-title">
          <div className="landing-section-heading landing-reveal"><p className="landing-eyebrow">A BETTER WORKING DAY</p><h2 id="features-title">Good decisions start with<br />the right information.</h2><p>From the first item on your shelf to the last sale of the day.<br />Keep the details together, and the bigger picture in view.</p></div>
          <div className="landing-feature-grid">
            {[
              { number: '01', icon: 'box', title: 'Inventory, in order.', copy: 'Search products, track stock changes, and spot low-stock items before the next sale.' },
              { number: '02', icon: 'sale', title: 'Checkout, connected.', copy: 'Build a cart, complete a sale, and create an invoice. Stock and customer history update together.' },
              { number: '03', icon: 'chart', title: 'A little more foresight.', copy: 'Review sales trends and 14-day demand estimates to make better-informed restocking decisions.' },
            ].map(item => <article className="landing-feature landing-reveal" key={item.number}><div className="landing-feature-top"><Icon name={item.icon} width="26" height="26" /><span>{item.number}</span></div><h3>{item.title}</h3><p>{item.copy}</p></article>)}
          </div>
        </section>


        <section id="about" className="landing-workflow" aria-labelledby="workflow-title">
          <div className="landing-container landing-workflow-grid">
            <div className="landing-reveal"><p className="landing-eyebrow">ONE CONTINUOUS WORKFLOW</p><h2 id="workflow-title">The details stay<br />connected.</h2><p className="landing-body">An invoice should agree with your inventory. A customer’s history should reflect their purchases. StockWise keeps these everyday details together.</p><a className="landing-text-link" href="#contact">Arrange a walkthrough</a></div>
            <ol className="landing-steps">
              <li className="landing-reveal"><span>01</span><div><h3>Add and organise</h3><p>Keep product details, prices, and stock movements in one inventory.</p></div></li>
              <li className="landing-reveal"><span>02</span><div><h3>Sell and record</h3><p>Complete checkout with saved invoice details and automatic stock deduction.</p></div></li>
              <li className="landing-reveal"><span>03</span><div><h3>Review and plan</h3><p>Explore reports, demand estimates, and the read-only business assistant.</p></div></li>
            </ol>
          </div>
        </section>

        <section id="contact" className="landing-container landing-contact landing-reveal" aria-labelledby="contact-title">
          <div><p className="landing-eyebrow">LET’S TALK</p><h2 id="contact-title">Have a workflow<br />in mind?</h2><p>Take a closer look at StockWise AI, or discuss an inventory and sales app for your business.</p></div>
          <div className="landing-contact-links"><a href={emailUrl}><span><small>EMAIL</small><strong>golammoula287@gmail.com</strong></span></a><a href={whatsappUrl} target="_blank" rel="noopener noreferrer"><span><small>WHATSAPP</small><strong>01708084799</strong></span></a></div>
        </section>
      </main>

      <footer className="landing-footer">
        <div className="landing-container landing-footer-top landing-reveal">
          <div className="landing-footer-brand"><Link to="/" aria-label="StockWise AI home"><Brand /></Link><p>Inventory, sales, and a clearer<br />view of your business.</p></div>
          <div><h2>Explore</h2><a href="#features">Features</a><a href="#about">How it works</a><Link to="/login">Open demo</Link></div>
          <div><h2>Project</h2><a href="https://github.com/golammoula287/stockwise-ai" target="_blank" rel="noopener noreferrer">View source </a><a href="#contact">Get in touch</a><a href="#top">Back to top</a></div>
          <div className="landing-footer-note"><h2>A note on the demo</h2><p>Fictional data. Interactive browser demo.<br />Forecasts are estimates, not guarantees. Demo changes reset on refresh. Retail imagery is illustrative.</p></div>
        </div>
        <div className="landing-container landing-footer-bottom"><span>© {new Date().getFullYear()} StockWise AI</span><span>Designed & built as an independent portfolio project.</span></div>
      </footer>
    </div>
  );
}
