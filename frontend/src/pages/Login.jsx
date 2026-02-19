import { useState } from "react"
import { useDispatch, useSelector } from 'react-redux'
import { Link } from 'react-router-dom'
import { loginUser } from '../features/authSlice'
import { authStyles as s } from '../components/AuthStyles'
import BitcoinVideo from '../assets/Bitcoin_spinning.mp4'

const Login = () => {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  // Add rememberMe state
  const [rememberMe, setRememberMe] = useState(false)
  
  const [videoLoaded, setVideoLoaded] = useState(false)
  const dispatch = useDispatch()
  const isLoading = useSelector((state) => state.auth.loading)
  const error = useSelector((state) => state.auth.error)

  const handleSubmit = async (e) => {
    e.preventDefault()
    // Pass rememberMe to action
    await dispatch(loginUser({ email, password, rememberMe }))
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
          <h1 className={s.heroTitle}>Welcome <br /> Back!</h1>
          <p className={s.heroSubtitle}>
            Log in to access your account and continue trading crypto securely.
          </p>
        </div>
      </div>

      {/* Right Side - Login Form */}
      <div className={s.rightSection}>
        <div className={s.formContainer}>
          <div className={s.header}>
            <h2 className={s.title}>Log In</h2>
            <p className={s.subTitle}>Enter your credentials to access your account.</p>
          </div>

          <form onSubmit={handleSubmit}>
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

            <div className="flex items-center justify-between mb-6">
              <label className="flex items-center gap-2 text-sm text-gray-400 cursor-pointer group">
                {/* Remember Me Checkbox */}
                <input 
                  type="checkbox" 
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="w-4 h-4 rounded border-white/[0.1] bg-white/[0.05] text-[#00D68F] focus:ring-[#00D68F] focus:ring-offset-0"
                />
                <span className="group-hover:text-white transition-colors">Remember me</span>
              </label>
              <Link to="/forgot-password" className="text-sm text-[#00D68F] hover:text-[#00bd7e] transition-colors">
                Forgot Password?
              </Link>
            </div>

            <button disabled={isLoading} className={s.submitBtn}>
              {isLoading ? 'Logging in...' : 'Log In'}
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