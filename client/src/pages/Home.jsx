import { useState } from 'react';
import { Link } from 'react-router-dom';

export default function Home() {
  const [contactSent, setContactSent] = useState(false);
  const [mobileMenu, setMobileMenu] = useState(false);

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#f8fbff] via-white to-[#f1f5f9] text-slate-800">
      {/* Public Navbar */}
      <header className="sticky top-0 z-30 bg-white/90 backdrop-blur border-b border-slate-100">
        <nav className="max-w-[1200px] mx-auto flex items-center justify-between px-6 py-4">
          <Link to="/" className="flex items-center gap-2.5 font-extrabold text-xl text-slate-900">
            <span className="bg-blue-600 text-white w-8 h-8 rounded-lg grid place-items-center shadow-sm">⬢</span>
            <span>StockWise AI</span>
          </Link>

          <div className="hidden md:flex items-center gap-8 text-sm font-medium text-slate-600">
            <a href="#top" className="text-slate-900 font-semibold border-b-2 border-blue-600 pb-1">Home</a>
            <a href="#features" className="hover:text-blue-600 transition">Features</a>
            <a href="#about" className="hover:text-blue-600 transition">About</a>
            <a href="#contact" className="hover:text-blue-600 transition">Contact</a>
          </div>

          <div className="hidden md:flex items-center gap-3">
            <Link
              to="/login"
              className="px-5 py-2 rounded-lg border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition"
            >
              Login
            </Link>
            <Link
              to="/login"
              className="px-5 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 shadow-sm transition"
            >
              Get Started
            </Link>
          </div>

          <button
            onClick={() => setMobileMenu(v => !v)}
            className="md:hidden p-2 rounded-lg border text-slate-600"
            aria-label="Toggle Menu"
          >
            ☰
          </button>
        </nav>

        {mobileMenu && (
          <div className="md:hidden px-6 pb-4 space-y-2 bg-white border-b text-sm">
            <a href="#top" onClick={() => setMobileMenu(false)} className="block py-1 font-semibold text-blue-600">Home</a>
            <a href="#features" onClick={() => setMobileMenu(false)} className="block py-1 text-slate-600">Features</a>
            <a href="#about" onClick={() => setMobileMenu(false)} className="block py-1 text-slate-600">About</a>
            <a href="#contact" onClick={() => setMobileMenu(false)} className="block py-1 text-slate-600">Contact</a>
            <div className="pt-2 flex gap-2">
              <Link to="/login" className="flex-1 text-center py-2 border rounded-lg font-medium">Login</Link>
              <Link to="/login" className="flex-1 text-center py-2 bg-blue-600 text-white rounded-lg font-semibold">Get Started</Link>
            </div>
          </div>
        )}
      </header>

      {/* Hero Section */}
      <section id="top" className="max-w-[1200px] mx-auto px-6 pt-12 pb-10 grid md:grid-cols-12 gap-10 items-center">
        <div className="md:col-span-6">
          <span className="inline-block text-xs font-semibold text-blue-600 bg-blue-50 border border-blue-100 px-3.5 py-1.5 rounded-full">
            Smart Business Solution
          </span>
          <h1 className="mt-4 text-4xl md:text-[46px] font-extrabold leading-[1.15] text-slate-900 tracking-tight">
            Manage Your <br />
            Inventory &amp; Sales <br />
            Smarter with <span className="text-blue-600">AI Insights</span>
          </h1>
          <p className="mt-4 text-slate-600 text-base leading-relaxed max-w-lg">
            A simple and powerful system to manage products, sales, customers and inventory with smart recommendations.
          </p>
          <div className="mt-7 flex flex-wrap gap-3.5">
            <Link
              to="/login"
              className="px-7 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold shadow-md shadow-blue-600/20 transition"
            >
              Get Started
            </Link>
            <a
              href="#features"
              className="px-7 py-3 bg-white hover:bg-slate-50 border border-slate-200 text-slate-800 rounded-xl font-semibold transition"
            >
              Learn More
            </a>
          </div>
        </div>

        {/* Hero Mockup & Floating Insight Cards */}
        <div className="md:col-span-6 relative">
          <div className="bg-slate-900 rounded-2xl p-3 shadow-2xl border border-slate-800 max-w-md mx-auto">
            <div className="bg-white rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between border-b pb-2">
                <div className="flex items-center gap-2 font-bold text-xs text-slate-800">
                  <span className="bg-blue-600 text-white w-5 h-5 rounded grid place-items-center text-[10px]">⬢</span>
                  StockWise AI Dashboard
                </div>
                <span className="text-[10px] text-slate-400">Preview</span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div className="bg-emerald-50 p-2.5 rounded-lg">
                  <div className="text-[10px] text-slate-500">Products</div>
                  <div className="font-bold text-sm text-slate-800">150</div>
                </div>
                <div className="bg-blue-50 p-2.5 rounded-lg">
                  <div className="text-[10px] text-slate-500">Revenue</div>
                  <div className="font-bold text-sm text-blue-700">৳ 125K</div>
                </div>
                <div className="bg-amber-50 p-2.5 rounded-lg">
                  <div className="text-[10px] text-slate-500">Low Stock</div>
                  <div className="font-bold text-sm text-amber-700">8 items</div>
                </div>
              </div>
              {/* Mini SVG Trend Chart */}
              <div className="bg-slate-50 rounded-lg p-3">
                <div className="text-[10px] font-semibold text-slate-500 mb-1">Monthly Revenue Trend</div>
                <svg viewBox="0 0 260 70" className="w-full h-16">
                  <defs>
                    <linearGradient id="heroGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#2563eb" stopOpacity="0.3" />
                      <stop offset="100%" stopColor="#2563eb" stopOpacity="0.0" />
                    </linearGradient>
                  </defs>
                  <path d="M5,58 L45,44 L85,48 L125,32 L165,35 L205,18 L255,8 L255,68 L5,68 Z" fill="url(#heroGrad)" />
                  <polyline
                    fill="none"
                    stroke="#2563eb"
                    strokeWidth="2.5"
                    points="5,58 45,44 85,48 125,32 165,35 205,18 255,8"
                  />
                </svg>
              </div>
            </div>
          </div>

          {/* Floating Card 1: Total Sales */}
          <div className="sm:absolute -top-4 right-0 mt-3 sm:mt-0 bg-white border border-slate-100 shadow-lg rounded-2xl px-4 py-3 flex items-center gap-3">
            <span className="w-9 h-9 rounded-xl bg-emerald-100 text-emerald-700 grid place-items-center font-bold">৳</span>
            <div>
              <div className="text-[11px] text-slate-500">Total Sales</div>
              <div className="text-base font-extrabold text-slate-900">৳ 125,000</div>
              <div className="text-[11px] text-emerald-600 font-medium">+12% this month</div>
            </div>
          </div>

          {/* Floating Card 2: Low Stock */}
          <div className="sm:absolute top-28 -right-3 mt-3 sm:mt-0 bg-white border border-slate-100 shadow-lg rounded-2xl px-4 py-3 flex items-center gap-3">
            <span className="w-9 h-9 rounded-xl bg-red-100 text-red-600 grid place-items-center font-bold">⚠</span>
            <div>
              <div className="text-[11px] text-slate-500">Low Stock</div>
              <div className="text-sm font-extrabold text-slate-900">8 products</div>
            </div>
          </div>

          {/* Floating Card 3: AI Recommendation */}
          <div className="sm:absolute -bottom-4 right-2 mt-3 sm:mt-0 bg-white border border-slate-100 shadow-lg rounded-2xl px-4 py-3 flex items-center gap-3">
            <span className="w-9 h-9 rounded-xl bg-amber-100 text-amber-600 grid place-items-center font-bold">✦</span>
            <div>
              <div className="text-xs font-bold text-slate-900">AI Recommendation</div>
              <div className="text-xs text-blue-600 font-medium">Restock 3 products</div>
            </div>
          </div>
        </div>
      </section>

      {/* 4 Feature Strip Matching UI Reference */}
      <section id="features" className="max-w-[1200px] mx-auto px-6 py-10">
        <div className="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-sm grid sm:grid-cols-2 md:grid-cols-4 gap-6">
          {[
            { icon: '▣', bg: 'bg-emerald-100 text-emerald-700', title: 'Easy to Use', desc: 'Clean and simple interface' },
            { icon: '✦', bg: 'bg-purple-100 text-purple-700', title: 'AI Powered', desc: 'Smart recommendations' },
            { icon: '🛡', bg: 'bg-blue-100 text-blue-700', title: 'Secure', desc: 'Your data is safe' },
            { icon: '✓', bg: 'bg-teal-100 text-teal-700', title: 'Real-time Updates', desc: 'Track everything live' },
          ].map(f => (
            <div key={f.title} className="flex items-center gap-3.5">
              <div className={`w-11 h-11 rounded-full grid place-items-center text-base font-bold shrink-0 ${f.bg}`}>
                {f.icon}
              </div>
              <div>
                <div className="font-bold text-sm text-slate-900">{f.title}</div>
                <div className="text-xs text-slate-500 mt-0.5">{f.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* About Section */}
      <section id="about" className="max-w-[1200px] mx-auto px-6 py-8">
        <div className="bg-white border border-slate-200/80 rounded-2xl p-8 grid md:grid-cols-2 gap-8 items-center">
          <div>
            <span className="text-xs font-semibold text-blue-600 uppercase tracking-wider">About StockWise AI</span>
            <h2 className="text-2xl font-extrabold text-slate-900 mt-2">
              Designed for Modern Retail &amp; Growing Businesses
            </h2>
            <p className="text-sm text-slate-600 mt-3 leading-relaxed">
              StockWise AI (StockPro) combines point-of-sale checkout, real-time inventory deduction, customer relationship tracking, and data-driven AI restock insights in one cohesive workspace.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div className="p-4 rounded-xl bg-slate-50 border">
              <div className="font-bold text-blue-600 text-xl">100% Live</div>
              <div className="text-slate-600 text-xs mt-1">Automatic stock deduction on every completed sale</div>
            </div>
            <div className="p-4 rounded-xl bg-slate-50 border">
              <div className="font-bold text-emerald-600 text-xl">Smart AI</div>
              <div className="text-slate-600 text-xs mt-1">Reorder quantities calculated from 30-day velocity</div>
            </div>
          </div>
        </div>
      </section>

      {/* Contact Section */}
      <section id="contact" className="max-w-[1200px] mx-auto px-6 py-8 pb-16">
        <div className="bg-[#111827] text-white rounded-2xl p-8 grid md:grid-cols-2 gap-8 items-center">
          <div>
            <h3 className="text-2xl font-bold">Need an Account or Have Questions?</h3>
            <p className="text-slate-300 text-sm mt-2">
              Contact the system administrator to provision staff accounts or schedule a live walkthrough.
            </p>
            <div className="mt-4 text-xs text-slate-400 space-y-1">
              <div>Email: admin@stockwise.com</div>
              <div>Phone: +880 1712-345678</div>
            </div>
          </div>
          <form
            onSubmit={e => {
              e.preventDefault();
              setContactSent(true);
            }}
            className="bg-white/5 border border-white/10 rounded-xl p-5 space-y-3"
          >
            {contactSent ? (
              <div className="text-emerald-400 text-sm py-4 text-center font-medium">
                ✓ Thank you! Your message has been sent to the administrator.
              </div>
            ) : (
              <>
                <input
                  required
                  placeholder="Your Name"
                  className="w-full bg-white/10 border border-white/15 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-400 outline-none"
                />
                <input
                  type="email"
                  required
                  placeholder="Your Email"
                  className="w-full bg-white/10 border border-white/15 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-400 outline-none"
                />
                <button className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2.5 rounded-lg text-sm transition">
                  Contact Admin
                </button>
              </>
            )}
          </form>
        </div>
      </section>
    </div>
  );
}
