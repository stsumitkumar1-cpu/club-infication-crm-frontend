import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchApi } from '../api/fetchApi';
import { useAuth } from '../app/providers/AuthProvider';
import './LoginPage.css';
import { Mail, Lock, AlertCircle, ArrowRight, Eye, EyeOff, CheckCircle } from 'lucide-react';

type AuthMode = 'login' | 'forgot' | 'reset';

export default function LoginPage() {
  const navigate = useNavigate();
  const { refresh } = useAuth();
  const [mode, setMode] = useState<AuthMode>('login');
  
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [resetToken, setResetToken] = useState('');
  
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  const switchMode = (newMode: AuthMode) => {
    setMode(newMode);
    setError('');
    setSuccess('');
    setPassword('');
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);

    try {
      const data = await fetchApi('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });

      localStorage.setItem('crm_token', data.accessToken);
      localStorage.setItem('crm_refresh_token', data.refreshToken);
      localStorage.setItem('crm_user', JSON.stringify(data.user));

      // Populate the auth context before navigating, otherwise the protected
      // route still sees no user and bounces straight back to /login.
      await refresh();
      navigate('/dashboard');

    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);

    try {
      const data = await fetchApi('/auth/forgot-password', {
        method: 'POST',
        body: JSON.stringify({ email }),
      });

      setSuccess(data.message);
      if (data.devToken) {
        setResetToken(data.devToken);
        // Automatically switch to reset mode for dev ease
        setTimeout(() => switchMode('reset'), 1500);
      }

    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);

    try {
      const data = await fetchApi('/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify({ token: resetToken, newPassword: password }),
      });

      setSuccess(data.message);
      setTimeout(() => switchMode('login'), 2000);

    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-layout">
      <div className="login-brand-side">
        <div className="brand-content">
          <img
            className="brand-logo-large"
            src="/logo.png"
            alt="Club Infication"
            width={80}
            height={80}
          />
          <h1>Welcome to Club Infication CRM</h1>
          <p>
            The ultimate operational hub for managing teams, tracking sales,
            and seamlessly controlling customer entitlements.
          </p>
          <div className="brand-features">
            <div className="feature-item">
              <div className="feature-icon"><ArrowRight size={16} /></div>
              <span>Advanced Role-Based Access</span>
            </div>
            <div className="feature-item">
              <div className="feature-icon"><ArrowRight size={16} /></div>
              <span>Real-time Team Tracking</span>
            </div>
            <div className="feature-item">
              <div className="feature-icon"><ArrowRight size={16} /></div>
              <span>Membership &amp; Payment Tracking</span>
            </div>
          </div>
        </div>
        <div className="brand-bg-pattern"></div>
      </div>

      <div className="login-form-side">
        <div className="login-content-wrapper">
          <h2 className="my-account-title">
            {mode === 'login' && 'My Account'}
            {mode === 'forgot' && 'Reset Password'}
            {mode === 'reset' && 'Create New Password'}
          </h2>

          <div className="login-box-wrapper">
            <div className="avatar-circle">
              {mode === 'login' ? (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                  <circle cx="12" cy="7" r="4"></circle>
                </svg>
              ) : (
                <Lock size={24} color="#1a3644" />
              )}
            </div>

            {error && (
              <div className="error-banner">
                <AlertCircle size={18} />
                <span>{error}</span>
              </div>
            )}
            
            {success && (
              <div className="error-banner" style={{ backgroundColor: '#f0fdf4', color: '#16a34a', border: '1px solid #bbf7d0' }}>
                <CheckCircle size={18} />
                <span>{success}</span>
              </div>
            )}

            {mode === 'login' && (
              <form onSubmit={handleLogin} className="login-form">
                <div className="material-input-group">
                  <div className="material-icon">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                      <circle cx="12" cy="7" r="4"></circle>
                    </svg>
                  </div>
                  <input
                    type="email"
                    required
                    placeholder="Enter Email Address"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>

                <div className="material-input-group">
                  <div className="material-icon">
                    <Lock size={20} />
                  </div>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    placeholder="Password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                  <button 
                    type="button"
                    className="password-toggle-btn"
                    onClick={() => setShowPassword(!showPassword)}
                    aria-label="Toggle password visibility"
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>

                <div className="forgot-password">
                  <a href="#" onClick={(e) => { e.preventDefault(); switchMode('forgot'); }}>Forgot password ?</a>
                </div>

                <button type="submit" className="login-btn-orange" disabled={loading}>
                  {loading ? 'Authenticating...' : 'Sign in'}
                </button>
              </form>
            )}

            {mode === 'forgot' && (
              <form onSubmit={handleForgotPassword} className="login-form">
                <p style={{ color: '#6b7280', fontSize: '14px', margin: '-10px 0 20px', textAlign: 'center' }}>
                  Enter your email and we'll send a token to reset your password.
                </p>
                <div className="material-input-group">
                  <div className="material-icon">
                    <Mail size={20} />
                  </div>
                  <input
                    type="email"
                    required
                    placeholder="Enter Email Address"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>

                <button type="submit" className="login-btn-orange" disabled={loading}>
                  {loading ? 'Sending...' : 'Send Reset Link'}
                </button>
                
                <div className="forgot-password" style={{ marginTop: '15px', textAlign: 'center' }}>
                  <a href="#" onClick={(e) => { e.preventDefault(); switchMode('login'); }}>Back to Login</a>
                </div>
              </form>
            )}

            {mode === 'reset' && (
              <form onSubmit={handleResetPassword} className="login-form">
                <p style={{ color: '#6b7280', fontSize: '14px', margin: '-10px 0 20px', textAlign: 'center' }}>
                  Enter your reset token and your new password.
                </p>
                
                <div className="material-input-group">
                  <div className="material-icon">
                    <Mail size={20} />
                  </div>
                  <input
                    type="text"
                    required
                    placeholder="Reset Token"
                    value={resetToken}
                    onChange={(e) => setResetToken(e.target.value)}
                  />
                </div>

                <div className="material-input-group">
                  <div className="material-icon">
                    <Lock size={20} />
                  </div>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    placeholder="New Password (min 6 chars)"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                  <button 
                    type="button"
                    className="password-toggle-btn"
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>

                <button type="submit" className="login-btn-orange" disabled={loading}>
                  {loading ? 'Resetting...' : 'Reset Password'}
                </button>
                
                <div className="forgot-password" style={{ marginTop: '15px', textAlign: 'center' }}>
                  <a href="#" onClick={(e) => { e.preventDefault(); switchMode('login'); }}>Back to Login</a>
                </div>
              </form>
            )}

          </div>
        </div>
      </div>
    </div>
  );
}
