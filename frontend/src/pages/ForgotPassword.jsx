import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { authStyles as s } from '../components/AuthStyles';
import API_URL from '../config/api';
import BitcoinVideo from '../assets/Bitcoin_spinning.mp4';

const STEPS = { EMAIL: 'email', CODE: 'code', DONE: 'done' };

const ForgotPassword = () => {
  const navigate = useNavigate();
  const [step, setStep] = useState(STEPS.EMAIL);

  // Form fields
  const [email, setEmail]       = useState('');
  const [code, setCode]         = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm]   = useState('');

  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');
  const [videoLoaded, setVideoLoaded] = useState(false);

  // Step 1: Request reset code
  const handleRequestCode = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/user/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Request failed');
      setStep(STEPS.CODE);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Step 2: Submit code + new password
  const handleResetPassword = async (e) => {
    e.preventDefault();
    setError('');
    if (password !== confirm) {
      setError('Passwords do not match');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/user/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, code, newPassword: password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Reset failed');
      setStep(STEPS.DONE);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={s.wrapper}>
      {/* Left Side - Video */}
      <div className={s.leftSection}>
        <video
          autoPlay loop muted playsInline preload="auto"
          className={s.videoBg}
          onLoadedData={() => setVideoLoaded(true)}
        >
          <source src={BitcoinVideo} type="video/mp4" />
        </video>
        {!videoLoaded && (
          <div className="absolute inset-0 bg-gradient-to-br from-[#00D68F]/10 via-[#0a0b0d] to-[#00bd7e]/10 animate-pulse" />
        )}
        <div className={s.overlay} />
        <div className={s.textContent}>
          <h1 className={s.heroTitle}>Reset Your <br /> Password.</h1>
          <p className={s.heroSubtitle}>
            We'll send a verification code to your email to help you get back into your account.
          </p>
        </div>
      </div>

      {/* Right Side - Form */}
      <div className={s.rightSection}>
        <div className={s.formContainer}>

          {/* ── Step 1: Enter email ── */}
          {step === STEPS.EMAIL && (
            <>
              <div className={s.header}>
                <h2 className={s.title}>Forgot Password</h2>
                <p className={s.subTitle}>
                  Enter your email address and we'll send you a 6-digit reset code.
                </p>
              </div>
              <form onSubmit={handleRequestCode}>
                <div className={s.inputGroup}>
                  <label className={s.label}>Email Address</label>
                  <input
                    type="email"
                    required
                    className={s.input}
                    placeholder="name@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
                <button disabled={loading} className={s.submitBtn}>
                  {loading ? 'Sending...' : 'Send Reset Code'}
                </button>
                {error && <div className={s.errorBox}>{error}</div>}
                <div className={s.footerText}>
                  Remember your password?
                  <Link to="/login" className={s.link}>Log In</Link>
                </div>
              </form>
            </>
          )}

          {/* ── Step 2: Enter code + new password ── */}
          {step === STEPS.CODE && (
            <>
              <div className={s.header}>
                <h2 className={s.title}>Enter Reset Code</h2>
                <p className={s.subTitle}>
                  We sent a 6-digit code to <strong className="text-white">{email}</strong>.
                  Check your inbox (and spam folder).
                </p>
              </div>
              <form onSubmit={handleResetPassword}>
                <div className={s.inputGroup}>
                  <label className={s.label}>6-Digit Code</label>
                  <input
                    type="text"
                    required
                    maxLength={6}
                    className={`${s.input} text-center tracking-[0.5em] text-xl font-mono`}
                    placeholder="000000"
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  />
                </div>
                <div className={s.inputGroup}>
                  <label className={s.label}>New Password</label>
                  <input
                    type="password"
                    required
                    className={s.input}
                    placeholder="Min 8 chars, uppercase, number, symbol"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </div>
                <div className={s.inputGroup}>
                  <label className={s.label}>Confirm New Password</label>
                  <input
                    type="password"
                    required
                    className={s.input}
                    placeholder="Repeat new password"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                  />
                </div>
                <button disabled={loading} className={s.submitBtn}>
                  {loading ? 'Resetting...' : 'Reset Password'}
                </button>
                {error && <div className={s.errorBox}>{error}</div>}
                <div className={s.footerText}>
                  <button
                    type="button"
                    onClick={() => { setStep(STEPS.EMAIL); setError(''); setCode(''); }}
                    className="text-[#00D68F] hover:text-[#00ba7c] font-semibold cursor-pointer transition-colors"
                  >
                    Use a different email
                  </button>
                </div>
              </form>
            </>
          )}

          {/* ── Step 3: Success ── */}
          {step === STEPS.DONE && (
            <div className="text-center">
              <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-[#00D68F]/10 mb-6">
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#00D68F" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </div>
              <h2 className={s.title}>Password Reset!</h2>
              <p className="text-[#848e9c] text-sm mt-2 mb-8">
                Your password has been changed successfully. You can now log in with your new password.
              </p>
              <button
                onClick={() => navigate('/login')}
                className={s.submitBtn}
              >
                Go to Login
              </button>
            </div>
          )}

        </div>
      </div>
    </div>
  );
};

export default ForgotPassword;
