import { useState, useEffect, useRef } from "react"
import { useDispatch, useSelector } from 'react-redux'
import { Link, useSearchParams } from 'react-router-dom'
import { sendSignupOtp, verifySignupOtp, clearOtpStep } from '../features/authSlice'
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

// ── Main Signup component ────────────────────────────────────────
const Signup = () => {
  const [name, setName]               = useState('')
  const [email, setEmail]             = useState('')
  const [password, setPassword]       = useState('')
  const [referralCode, setReferralCode]   = useState('')
  const [refLocked, setRefLocked]         = useState(false)
  const [otp, setOtp]                 = useState(['', '', '', '', '', ''])
  const [videoLoaded, setVideoLoaded] = useState(false)
  const [resendCooldown, setResendCooldown] = useState(0)

  const [searchParams] = useSearchParams()

  const dispatch   = useDispatch()
  const isLoading  = useSelector((state) => state.auth.loading)
  const error      = useSelector((state) => state.auth.error)
  const otpStep    = useSelector((state) => state.auth.otpStep)
  const otpEmail   = useSelector((state) => state.auth.otpEmail)

  const cooldownRef = useRef(null)

  useEffect(() => {
    const refFromUrl = searchParams.get('ref')
    if (refFromUrl) {
      setReferralCode(refFromUrl)
      setRefLocked(true)
    }
  }, [searchParams])

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

  // Start 60s resend cooldown when OTP step first activates
  useEffect(() => {
    if (otpStep === 'signup') startCooldown()
    return () => clearInterval(cooldownRef.current)
  }, [otpStep]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleFormSubmit = (e) => {
    e.preventDefault()
    dispatch(sendSignupOtp({ name, email, password, referralCode }))
  }

  const handleOtpSubmit = (e) => {
    e.preventDefault()
    const code = otp.join('')
    if (code.length < 6) return
    dispatch(verifySignupOtp({ email: otpEmail, code }))
  }

  const handleResend = async () => {
    try {
      await dispatch(sendSignupOtp({ name, email, password, referralCode })).unwrap()
      setOtp(['', '', '', '', '', ''])
      startCooldown()
    } catch (_) { /* error already shown via Redux state */ }
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
        <h1 className={s.heroTitle}>Start Your <br /> Journey Today.</h1>
        <p className={s.heroSubtitle}>
          Join millions of users buying and selling crypto on the most secure exchange platform.
        </p>
      </div>
    </div>
  )

  // ── OTP verification screen ────────────────────────────────────
  if (otpStep === 'signup') {
    return (
      <div className={s.wrapper}>
        {leftSide}
        <div className={s.rightSection}>
          <div className={s.formContainer}>
            <div className={s.header}>
              <h2 className={s.title}>Verify Your Email</h2>
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
                {isLoading ? 'Verifying...' : 'Verify & Create Account'}
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

  // ── Registration form ──────────────────────────────────────────
  return (
    <div className={s.wrapper}>
      {leftSide}
      <div className={s.rightSection}>
        <div className={s.formContainer}>
          <div className={s.header}>
            <h2 className={s.title}>Create Account</h2>
            <p className={s.subTitle}>Sign up to start trading in minutes.</p>
          </div>

          <form onSubmit={handleFormSubmit}>
            <div className={s.inputGroup}>
              <label className={s.label}>Full Name</label>
              <input
                type="text"
                className={s.input}
                onChange={(e) => setName(e.target.value)}
                value={name}
                placeholder="John Doe"
                required
              />
            </div>

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
                placeholder="Choose a strong password"
                required
              />
            </div>

            <div className={s.inputGroup}>
              <label className={s.label}>
                Referral Code
                {refLocked
                  ? <span className="ml-2 text-[#0ecb81] normal-case font-normal tracking-normal">Applied</span>
                  : <span className="ml-1 opacity-60 normal-case font-normal tracking-normal">(Optional)</span>
                }
              </label>
              <input
                type="text"
                className={`${s.input} ${refLocked ? 'opacity-70 cursor-not-allowed border-[#0ecb81]/40 text-[#0ecb81]' : ''}`}
                onChange={refLocked ? undefined : (e) => setReferralCode(e.target.value)}
                readOnly={refLocked}
                value={referralCode}
                placeholder="e.g. MAX8F2A9B"
              />
            </div>

            <button disabled={isLoading} className={s.submitBtn}>
              {isLoading ? 'Sending code...' : 'Continue'}
            </button>

            {error && <div className={s.errorBox}>{error}</div>}

            <div className={s.footerText}>
              Already have an account?
              <Link to="/login" className={s.link}>Log In</Link>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}

export default Signup
