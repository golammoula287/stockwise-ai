import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [err, setErr] = useState('');
  const [info, setInfo] = useState('');
  const { login, loading } = useAuth();
  const navigate = useNavigate();

  const submit = async (e) => {
    e.preventDefault();
    setErr('');
    setInfo('');
    if (!email.trim() || !password) {
      setErr('Please enter both your email address and password.');
      return;
    }
    try {
      await login(email.trim(), password);
      navigate('/dashboard');
    } catch (e2) {
      setErr(
        e2.response?.data?.message ||
        e2.response?.data?.errors?.[0]?.msg ||
        'Invalid email or password'
      );
    }
  };

  return (
    <div className="min-h-screen bg-[#f1f5f9] grid md:grid-cols-12 items-center">
      {/* Left Column: Login Card */}
      <div className="md:col-span-7 flex items-center justify-center p-6">
        <form
          onSubmit={submit}
          className="bg-white w-full max-w-[430px] rounded-2xl shadow-lg shadow-slate-200/60 border border-slate-100 p-8"
        >
          <Link to="/" className="flex items-center gap-2 font-extrabold text-lg justify-center text-slate-900">
            <span className="bg-blue-600 text-white w-7 h-7 rounded-lg grid place-items-center text-sm">⬢</span>
            <span>StockPro</span>
          </Link>

          <h2 className="text-center font-extrabold text-2xl text-slate-900 mt-5">Welcome Back</h2>
          <p className="text-center text-xs text-slate-500 mt-1">Login to your account to continue</p>

          {/* Email Input */}
          <div className="mt-6">
            <label htmlFor="login-email" className="sr-only">Email address</label>
            <div className="relative flex items-center">
              <span className="absolute left-3.5 text-slate-400 text-sm">✉</span>
              <input
                id="login-email"
                type="email"
                required
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="Email address"
                className="w-full border border-slate-200 rounded-xl pl-10 pr-3.5 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              />
            </div>
          </div>

          {/* Password Input */}
          <div className="mt-3.5">
            <label htmlFor="login-password" className="sr-only">Password</label>
            <div className="relative flex items-center">
              <span className="absolute left-3.5 text-slate-400 text-sm">🔒</span>
              <input
                id="login-password"
                type={showPw ? 'text' : 'password'}
                required
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Password"
                className="w-full border border-slate-200 rounded-xl pl-10 pr-10 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              />
              <button
                type="button"
                onClick={() => setShowPw(v => !v)}
                className="absolute right-3 text-slate-400 hover:text-slate-600 text-xs"
                aria-label="Toggle password visibility"
              >
                {showPw ? '🙈' : '👁'}
              </button>
            </div>
          </div>

          {/* Remember Me & Forgot Password */}
          <div className="flex items-center justify-between mt-4 text-xs">
            <label className="flex items-center gap-2 text-slate-600 cursor-pointer">
              <input type="checkbox" defaultChecked className="rounded text-blue-600 focus:ring-blue-500" />
              <span>Remember me</span>
            </label>
            <button
              type="button"
              onClick={() => setInfo('Password resets are managed by your administrator (admin@stockwise.com).')}
              className="text-blue-600 hover:underline font-medium"
            >
              Forgot password?
            </button>
          </div>

          {err && (
            <div role="alert" className="mt-3 text-xs text-red-600 bg-red-50 border border-red-200 rounded-xl p-2.5">
              {err}
            </div>
          )}
          {info && (
            <div className="mt-3 text-xs text-blue-700 bg-blue-50 border border-blue-200 rounded-xl p-2.5">
              {info}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full mt-5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl py-2.5 text-sm font-semibold shadow-sm disabled:opacity-60 transition"
          >
            {loading ? 'Signing in...' : 'Login'}
          </button>

          <div className="mt-2.5 text-center">
            <button
              type="button"
              onClick={() => {
                setEmail('admin@stockwise.com');
                setPassword('admin123');
                setErr('');
              }}
              className="text-[11px] text-slate-500 hover:text-blue-600 underline"
            >
              Fill demo evaluator credentials
            </button>
          </div>

          <div className="relative my-4 text-center">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-slate-200" />
            </div>
            <span className="relative bg-white px-3 text-xs text-slate-400">or</span>
          </div>

          <button
            type="button"
            disabled
            title="Google OAuth is not configured in this deployment"
            className="w-full border border-slate-200 bg-slate-50 text-slate-400 rounded-xl py-2.5 flex items-center justify-center gap-2 text-xs font-medium cursor-not-allowed"
          >
            <span className="font-bold">G</span>
            <span>Continue with Google (Unavailable)</span>
          </button>

          <p className="text-center text-xs mt-5 text-slate-500">
            Don&apos;t have an account?{' '}
            <Link to="/#contact" className="text-blue-600 font-semibold hover:underline">
              Contact Admin
            </Link>
          </p>
        </form>
      </div>

      {/* Right Column: Organize / Track / Grow Illustration */}
      <div className="hidden md:flex md:col-span-5 flex-col justify-center px-10 py-12">
        <div className="max-w-sm">
          <h2 className="text-4xl font-extrabold leading-tight text-slate-900">
            Organize <br />
            Track <br />
            Grow
          </h2>
          <p className="text-slate-500 text-sm mt-3">Everything in one place.</p>

          <div className="mt-8 bg-white/80 border border-slate-200/80 rounded-2xl p-6 shadow-sm">
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-amber-100/80 border border-amber-200 h-16 rounded-xl flex flex-col items-center justify-center text-xs font-semibold text-amber-800">
                📦 <span>Stock A</span>
              </div>
              <div className="bg-amber-100/80 border border-amber-200 h-16 rounded-xl flex flex-col items-center justify-center text-xs font-semibold text-amber-800">
                📦 <span>Stock B</span>
              </div>
              <div className="bg-blue-50 border border-blue-200 h-16 rounded-xl flex flex-col items-center justify-center text-xs font-semibold text-blue-700">
                📊 <span>+18%</span>
              </div>
              <div className="bg-amber-100/80 border border-amber-200 h-16 rounded-xl flex flex-col items-center justify-center text-xs font-semibold text-amber-800">
                📦 <span>Stock C</span>
              </div>
              <div className="bg-emerald-50 border border-emerald-200 h-16 rounded-xl flex flex-col items-center justify-center text-xs font-semibold text-emerald-700 col-span-2">
                ✦ <span>AI Inventory Active</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
