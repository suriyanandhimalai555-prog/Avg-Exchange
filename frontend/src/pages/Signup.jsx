import { useState, useEffect } from "react"
import { useDispatch, useSelector } from 'react-redux'
import { Link, useSearchParams } from 'react-router-dom'
import { signupUser } from '../features/authSlice'
import { authStyles as s } from '../components/AuthStyles'
import BitcoinVideo from '../assets/Bitcoin_spinning.mp4'

const Signup = () => {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [referralCode, setReferralCode] = useState('')
  const [videoLoaded, setVideoLoaded] = useState(false)
  
  const [searchParams] = useSearchParams();
  
  const dispatch = useDispatch()
  const isLoading = useSelector((state) => state.auth.loading)
  const error = useSelector((state) => state.auth.error)

  useEffect(() => {
    const refFromUrl = searchParams.get('ref');
    if (refFromUrl) {
      setReferralCode(refFromUrl);
    }
  }, [searchParams]);

  const handleSubmit = async (e) => {
    e.preventDefault()
    // Dispatch with name
    await dispatch(signupUser({ name, email, password, referralCode }))
  }

  return (
    <div className={s.wrapper}>
      {/* Left Side - Video & Branding */}
      <div className={s.leftSection}>
        <video 
          autoPlay 
          loop 
          muted 
          playsInline
          preload="auto"
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

      {/* Right Side - Signup Form */}
      <div className={s.rightSection}>
        <div className={s.formContainer}>
          <div className={s.header}>
            <h2 className={s.title}>Create Account</h2>
            <p className={s.subTitle}>Sign up to start trading in minutes.</p>
          </div>

          <form onSubmit={handleSubmit}>
            {/* Name Input */}
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
              <label className={s.label}>Referral Code (Optional)</label>
              <input 
                type="text" 
                className={s.input}
                onChange={(e) => setReferralCode(e.target.value)} 
                value={referralCode} 
                placeholder="e.g. AVG-X7Z9"
              />
            </div>

            <button disabled={isLoading} className={s.submitBtn}>
              {isLoading ? 'Creating Account...' : 'Sign Up'}
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