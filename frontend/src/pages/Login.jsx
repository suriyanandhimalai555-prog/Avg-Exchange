import { useState, useEffect, useRef } from "react"
import { useDispatch, useSelector } from 'react-redux'
import { Link } from 'react-router-dom'
import { sendLoginOtp, verifyLoginOtp, clearOtpStep } from '../features/authSlice'
import { authStyles as s } from '../components/AuthStyles'
import BitcoinVideo from '../assets/Bitcoin_spinning.mp4'

// ── OTP digit input ──────────────────────────────────────────────
function OtpInput({ value, onChange }) {
  const inputRefs = useRef([])

  const handleChange = (index, e) => {
    const char = e.target.value.replace(/\D/g, '').slice(-1)
    const next = [...value]
    next[index] = char
    onChange(next)
    if (char && index < 5) inputRefs.current[index + 1]?.focus()
  }

  const handleKeyDown = (index, e) => {
    if (e.key === 'Backspace' && !value[index] && index > 0) {
      inputRefs.current[index - 1]?.focus()
    }
  }

  const handlePaste = (e) => {
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6)
    if (pasted.length === 6) {
      onChange(pasted.split(''))
      inputRefs.current[5]?.focus()
    }
    e.preventDefault()
  }

  return (
    <div className="flex gap-3 justify-center" onPaste={handlePaste}>
      {value.map((digit, i) => (
        <input
          key={i}
          ref={el => inputRefs.current[i] = el}
          type="text"
          inputMode="numeric"
          maxLength={1}
          value={digit}
          onChange={e => handleChange(i, e)}
          onKeyDown={e => handleKeyDown(i, e)}
          className="w-12 h-14 text-center text-2xl font-bold font-mono bg-[#1e2026] border border-[#2b2f36] rounded-xl text-white focus:border-[#00D68F] focus:ring-1 focus:ring-[#00D68F] outline-none transition-all caret-transparent"
        />
      ))}
    </div>
  )
}

// ── Main Login component ─────────────────────────────────────────
const Login = () => {
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [otp, setOtp]           = useState(['', '', '', '', '', ''])
  const [videoLoaded, setVideoLoaded] = useState(false)
  const [resendCooldown, setResendCooldown] = useState(0)

  const dispatch   = useDispatch()
  const isLoading  = useSelector((state) => state.auth.loading)
  const error      = useSelector((state) => state.auth.error)
  const otpStep    = useSelector((state) => state.auth.otpStep)
  const otpEmail   = useSelector((state) => state.auth.otpEmail)

  const cooldownRef = useRef(null)

  // Start 60s resend cooldown when OTP step first activates
  useEffect(() => {
    if (otpStep === 'login') startCooldown()
    return () => clearInterval(cooldownRef.current)
  }, [otpStep]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleCredentialsSubmit = (e) => {
    e.preventDefault()
    dispatch(sendLoginOtp({ email, password }))
  }

  const handleOtpSubmit = (e) => {
    e.preventDefault()
    const code = otp.join('')
    if (code.length < 6) return
    dispatch(verifyLoginOtp({ email: otpEmail, code }))
  }

  const startCooldown = () => {
    clearInterval(cooldownRef.current)
    setResendCooldown(60)
    cooldownRef.current = setInterval(() => {
      setResendCooldown(prev => {
        if (prev <= 1) { clearInterval(cooldownRef.current); return 0 }
        return prev - 1
      })
    }, 1000)
  }

  const handleResend = async () => {
    const result = await dispatch(sendLoginOtp({ email, password }))
    if (result.type === 'auth/sendLoginOtp/fulfilled') {
      setOtp(['', '', '', '', '', ''])
      startCooldown()
    }
  }

  const handleBack = () => {
    clearInterval(cooldownRef.current)
    dispatch(clearOtpStep())
  }

  const leftSide = (
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
        <h1 className={s.heroTitle}>Welcome <br /> Back!</h1>
        <p className={s.heroSubtitle}>
          Log in to access your account and continue trading crypto securely.
        </p>
      </div>
    </div>
  )

  // ── OTP verification screen ────────────────────────────────────
  if (otpStep === 'login') {
    return (
      <div className={s.wrapper}>
        {leftSide}
        <div className={s.rightSection}>
          <div className={s.formContainer}>
            <div className={s.header}>
              <h2 className={s.title}>Check Your Email</h2>
              <p className={s.subTitle}>
                We sent a 6-digit code to <span className="text-white font-semibold">{otpEmail}</span>.
                It expires in 10 minutes.
              </p>
            </div>

            <form onSubmit={handleOtpSubmit}>
              <div className="mb-8">
                <label className={s.label}>Verification Code</label>
                <div className="mt-3">
                  <OtpInput value={otp} onChange={setOtp} />
                </div>
              </div>

              <button
                disabled={isLoading || otp.join('').length < 6}
                className={s.submitBtn}
              >
                {isLoading ? 'Verifying...' : 'Verify & Log In'}
              </button>

              {error && <div className={s.errorBox}>{error}</div>}

              <div className="mt-6 flex items-center justify-between text-sm">
                <button
                  type="button"
                  onClick={handleBack}
                  className="text-[#848e9c] hover:text-white transition-colors"
                >
                  ← Back
                </button>
                {resendCooldown > 0 ? (
                  <span className="text-[#848e9c]">Resend in {resendCooldown}s</span>
                ) : (
                  <button
                    type="button"
                    onClick={handleResend}
                    disabled={isLoading}
                    className="text-[#00D68F] hover:text-[#00ba7c] font-semibold transition-colors disabled:opacity-50"
                  >
                    Resend Code
                  </button>
                )}
              </div>
            </form>
          </div>
        </div>
      </div>
    )
  }

  // ── Credentials screen ─────────────────────────────────────────
  return (
    <div className={s.wrapper}>
      {leftSide}
      <div className={s.rightSection}>
        <div className={s.formContainer}>
          <div className={s.header}>
            <h2 className={s.title}>Log In</h2>
            <p className={s.subTitle}>Enter your credentials to access your account.</p>
          </div>

          <form onSubmit={handleCredentialsSubmit}>
            <div className={s.inputGroup}>
              <label className={s.label}>Email Address</label>
              <input
                type="email"
                className={s.input}
                onChange={(e) => setEmail(e.target.value)}
                value={email}
                placeholder="name@example.com"
                required
              />
            </div>

            <div className={s.inputGroup}>
              <label className={s.label}>Password</label>
              <input
                type="password"
                className={s.input}
                onChange={(e) => setPassword(e.target.value)}
                value={password}
                placeholder="Enter your password"
                required
              />
            </div>

            <div className="flex items-center justify-end mb-6">
              <Link to="/forgot-password" className="text-sm text-[#00D68F] hover:text-[#00ba7c] font-semibold transition-colors">
                Forgot Password?
              </Link>
            </div>

            <button disabled={isLoading} className={s.submitBtn}>
              {isLoading ? 'Sending code...' : 'Continue'}
            </button>

            {error && <div className={s.errorBox}>{error}</div>}

            <div className={s.footerText}>
              Don't have an account?
              <Link to="/signup" className={s.link}>Sign Up</Link>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}

export default Login
