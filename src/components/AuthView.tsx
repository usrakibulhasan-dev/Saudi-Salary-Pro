import React, { useState } from 'react';
import {
  ShieldCheck,
  Lock,
  UserPlus,
  LogIn,
  Globe,
  KeyRound,
  CheckCircle2,
  AlertCircle,
  ArrowLeft,
  Check,
} from 'lucide-react';
import { LANGUAGE_OPTIONS } from '../i18n/translations.ts';
import type { SupportedLanguage, UserPrivateDatabaseSlice } from '../types/payroll.ts';
import {
  apiLogin,
  apiRegister,
  apiGoogleAuth,
  apiForgotPassword,
  apiResetPassword,
} from '../storage/db.ts';
import { signInWithGooglePopup } from '../services/googleAuthAndDrive.ts';

interface AuthViewProps {
  language: SupportedLanguage;
  onLanguageChange: (lang: SupportedLanguage) => void;
  onAuthenticated: (slice: UserPrivateDatabaseSlice) => void;
}

export const AuthView: React.FC<AuthViewProps> = ({
  language,
  onLanguageChange,
  onAuthenticated,
}) => {
  const [mode, setMode] = useState<'login' | 'register' | 'forgot'>('login');
  const [email, setEmail] = useState('rahim.khan@example.sa');
  const [password, setPassword] = useState('SaudiPro#2026');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [nationality, setNationality] = useState('Bangladeshi');
  const [jobTitle, setJobTitle] = useState('');
  const [rememberMe, setRememberMe] = useState(true);

  // Forgot / Reset password state
  const [forgotStep, setForgotStep] = useState<1 | 2>(1);
  const [resetToken, setResetToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [resetTokenHint, setResetTokenHint] = useState<string | null>(null);

  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const handleGoogleSignIn = async () => {
    setError(null);
    setSuccessMsg(null);
    setGoogleLoading(true);
    try {
      const googleUser = await signInWithGooglePopup();
      const res = await apiGoogleAuth({
        email: googleUser.email,
        fullName: googleUser.fullName,
        photoUrl: googleUser.photoUrl,
        googleId: googleUser.googleId,
        preferredLanguage: language,
      });
      onAuthenticated(res.slice);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Google sign-in failed.');
    } finally {
      setGoogleLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);

    if (mode === 'register') {
      if (!fullName.trim()) {
        setError('Full Name is required.');
        return;
      }
      if (password.length < 8) {
        setError('Password must be at least 8 characters long.');
        return;
      }
      if (confirmPassword && password !== confirmPassword) {
        setError('Passwords do not match.');
        return;
      }
    }

    setLoading(true);
    try {
      if (mode === 'login') {
        const res = await apiLogin(email, password);
        onAuthenticated(res.slice);
      } else if (mode === 'register') {
        const res = await apiRegister({
          email,
          password,
          fullName,
          nationality,
          jobTitle,
          preferredLanguage: language,
        });
        onAuthenticated(res.slice);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentication failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPasswordRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);
    if (!email.trim() || !email.includes('@')) {
      setError('Please enter a valid personal email address.');
      return;
    }
    setLoading(true);
    try {
      const res = await apiForgotPassword(email);
      setResetToken(res.resetToken);
      setResetTokenHint(res.resetToken);
      setForgotStep(2);
      setSuccessMsg(`Password reset code generated: ${res.resetToken}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to request password reset.');
    } finally {
      setLoading(false);
    }
  };

  const handleResetPasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);

    if (!resetToken.trim()) {
      setError('Please enter the 8-character reset code.');
      return;
    }
    if (newPassword.length < 8) {
      setError('New password must be at least 8 characters long.');
      return;
    }
    if (newPassword !== confirmNewPassword) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);
    try {
      const res = await apiResetPassword(email, resetToken, newPassword);
      setSuccessMsg('Password updated successfully! Redirecting...');
      setTimeout(() => {
        onAuthenticated(res.slice);
      }, 500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reset password.');
    } finally {
      setLoading(false);
    }
  };

  const handleQuickDemoLogin = async (demoEmail: string) => {
    setError(null);
    setSuccessMsg(null);
    setLoading(true);
    try {
      const res = await apiLogin(demoEmail, 'SaudiPro#2026');
      onAuthenticated(res.slice);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Demo login failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0B111E] text-slate-100 flex flex-col justify-between p-4 sm:p-8">
      {/* Top Bar */}
      <header className="max-w-6xl w-full mx-auto flex flex-wrap items-center justify-between gap-4 border-b border-slate-800/80 pb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-600/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 font-bold text-lg">
            SSP
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight text-white">Saudi Salary Pro v2.0</h1>
            <p className="text-xs text-slate-400">
              Private Personal Employment Platform for Expatriate Employees in Saudi Arabia
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Globe className="w-4 h-4 text-emerald-400" />
          <select
            aria-label="Select Interface Language"
            value={language}
            onChange={(e) => onLanguageChange(e.target.value as SupportedLanguage)}
            className="bg-slate-900 border border-slate-700 text-xs text-slate-200 rounded-lg px-2.5 py-1.5"
          >
            {LANGUAGE_OPTIONS.map((opt) => (
              <option key={opt.code} value={opt.code}>
                {opt.nativeLabel} ({opt.label})
              </option>
            ))}
          </select>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-5xl w-full mx-auto my-8 grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
        {/* Left Column: Value Proposition & Privacy Guarantee */}
        <div className="lg:col-span-7 space-y-6">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-md bg-emerald-950/60 border border-emerald-700/50 text-emerald-300 text-xs font-medium">
            <ShieldCheck className="w-4 h-4" />
            <span>100% Isolated Personal Account — Not a Company HR Portal</span>
          </div>

          <h2 className="text-2xl sm:text-4xl font-bold tracking-tight text-white leading-tight">
            Track Your Own Saudi Salary, Attendance, Overtime, EOSB & Final Settlement Privately.
          </h2>

          <p className="text-sm sm:text-base text-slate-300 leading-relaxed">
            Built exclusively for expatriate workers in Saudi Arabia. Each user account is strictly isolated on the server—no employer or other user can ever view your salary slips, attendance log, contracts, or personal documents.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
            {[
              {
                title: 'Multi-Employer & Salary History',
                desc: 'Track job changes, promotions, and mid-month salary raises across your KSA career.',
              },
              {
                title: 'Daily Attendance & Art. 107 Overtime',
                desc: 'Log day/night shifts, deduct breaks, and compute exact statutory overtime pay.',
              },
              {
                title: 'Payslip OCR & Bank Reconciliation',
                desc: 'Compare expected pay vs payslip vs actual Mudad WPS bank credit to spot short-payments.',
              },
              {
                title: 'Google Drive Private Cloud Backup',
                desc: 'Authorize personal Google Drive to safely back up and restore your records anytime.',
              },
            ].map((item) => (
              <div
                key={item.title}
                className="p-3.5 rounded-xl bg-slate-900/70 border border-slate-800 space-y-1"
              >
                <div className="flex items-center gap-2 text-xs font-semibold text-emerald-400">
                  <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                  <span>{item.title}</span>
                </div>
                <p className="text-xs text-slate-400 leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>

          {/* Instant Demo Account Switcher */}
          <div className="p-4 rounded-xl bg-slate-900/90 border border-slate-800 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-amber-400">
                Instant Multi-Account Isolation Test (Synthetic Demo Profiles)
              </span>
              <span className="text-[11px] text-slate-400">Password: SaudiPro#2026</span>
            </div>
            <p className="text-xs text-slate-400">
              Sign in with either pre-populated fictional expatriate account below to verify that each user only sees their own isolated employment history, attendance, and payslips:
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <button
                type="button"
                disabled={loading || googleLoading}
                onClick={() => handleQuickDemoLogin('rahim.khan@example.sa')}
                className="flex items-center justify-between px-3.5 py-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-left transition"
              >
                <div>
                  <div className="text-xs font-semibold text-white">Account 1: Rahim Khan</div>
                  <div className="text-[11px] text-slate-400">Senior MEP Supervisor • Riyadh (2 Employers)</div>
                </div>
                <KeyRound className="w-4 h-4 text-emerald-400 shrink-0" />
              </button>
              <button
                type="button"
                disabled={loading || googleLoading}
                onClick={() => handleQuickDemoLogin('carlo.reyes@example.sa')}
                className="flex items-center justify-between px-3.5 py-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-left transition"
              >
                <div>
                  <div className="text-xs font-semibold text-white">Account 2: Carlo Reyes</div>
                  <div className="text-[11px] text-slate-400">QA/QC Civil Inspector • Jeddah (1 Employer)</div>
                </div>
                <KeyRound className="w-4 h-4 text-sky-400 shrink-0" />
              </button>
            </div>
          </div>
        </div>

        {/* Right Column: Authentication Card */}
        <div className="lg:col-span-5">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl space-y-5">
            {/* Primary Google Sign-In Button (Option A) */}
            <div className="space-y-3">
              <button
                type="button"
                onClick={handleGoogleSignIn}
                disabled={googleLoading || loading}
                className="w-full py-2.5 px-4 rounded-xl bg-white hover:bg-slate-100 text-slate-900 font-semibold text-sm transition flex items-center justify-center gap-3 shadow-sm border border-slate-200 disabled:opacity-60"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24">
                  <path
                    fill="#4285F4"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                  />
                </svg>
                <span>{googleLoading ? 'Connecting to Google...' : 'Continue with Google'}</span>
              </button>

              <div className="relative flex items-center justify-center">
                <div className="border-t border-slate-800 w-full" />
                <span className="bg-slate-900 px-3 text-[11px] uppercase tracking-wider text-slate-500 shrink-0">
                  or continue with email
                </span>
                <div className="border-t border-slate-800 w-full" />
              </div>
            </div>

            {/* Mode Selector Tabs (Option B) */}
            {mode !== 'forgot' ? (
              <div className="flex rounded-lg bg-slate-950 p-1 border border-slate-800">
                <button
                  type="button"
                  onClick={() => {
                    setMode('login');
                    setError(null);
                    setSuccessMsg(null);
                  }}
                  className={`flex-1 py-2 text-xs font-semibold rounded-md transition flex items-center justify-center gap-1.5 ${
                    mode === 'login'
                      ? 'bg-emerald-600 text-white'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <LogIn className="w-3.5 h-3.5" />
                  <span>Sign In</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMode('register');
                    setEmail('');
                    setPassword('');
                    setConfirmPassword('');
                    setError(null);
                    setSuccessMsg(null);
                  }}
                  className={`flex-1 py-2 text-xs font-semibold rounded-md transition flex items-center justify-center gap-1.5 ${
                    mode === 'register'
                      ? 'bg-emerald-600 text-white'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  <span>Create Account</span>
                </button>
              </div>
            ) : (
              <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                <button
                  type="button"
                  onClick={() => {
                    setMode('login');
                    setError(null);
                    setSuccessMsg(null);
                    setForgotStep(1);
                  }}
                  className="text-xs text-slate-400 hover:text-white flex items-center gap-1.5 transition"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>Back to Sign In</span>
                </button>
                <span className="text-xs font-semibold text-amber-400">
                  {forgotStep === 1 ? 'Step 1: Request Code' : 'Step 2: Set New Password'}
                </span>
              </div>
            )}

            {error && (
              <div className="p-3 rounded-lg bg-rose-950/70 border border-rose-700/60 text-xs text-rose-200 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-400 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            {successMsg && (
              <div className="p-3 rounded-lg bg-emerald-950/70 border border-emerald-700/60 text-xs text-emerald-200 flex items-start gap-2">
                <Check className="w-4 h-4 shrink-0 text-emerald-400 mt-0.5" />
                <span>{successMsg}</span>
              </div>
            )}

            {/* Standard Login / Register Form */}
            {mode !== 'forgot' ? (
              <form onSubmit={handleSubmit} className="space-y-4">
                {mode === 'register' && (
                  <>
                    <div>
                      <label className="block text-xs font-medium text-slate-300 mb-1">
                        Full Name (as on Iqama / Passport) <span className="text-rose-400">*</span>
                      </label>
                      <input
                        type="text"
                        required
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        placeholder="e.g. Mohammed Tariq"
                        className="w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-sm text-white"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-slate-300 mb-1">
                          Nationality
                        </label>
                        <input
                          type="text"
                          value={nationality}
                          onChange={(e) => setNationality(e.target.value)}
                          placeholder="e.g. Bangladeshi"
                          className="w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-sm text-white"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-300 mb-1">
                          Current Job Title
                        </label>
                        <input
                          type="text"
                          value={jobTitle}
                          onChange={(e) => setJobTitle(e.target.value)}
                          placeholder="e.g. Site Engineer"
                          className="w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-sm text-white"
                        />
                      </div>
                    </div>
                  </>
                )}

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Personal Email Address <span className="text-rose-400">*</span>
                  </label>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@example.com"
                    className="w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-sm text-white"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-medium text-slate-300">
                      Password (min. 8 characters) <span className="text-rose-400">*</span>
                    </label>
                    {mode === 'login' && (
                      <button
                        type="button"
                        onClick={() => {
                          setMode('forgot');
                          setError(null);
                          setSuccessMsg(null);
                          setForgotStep(1);
                        }}
                        className="text-[11px] text-emerald-400 hover:text-emerald-300 hover:underline"
                      >
                        Forgot password?
                      </button>
                    )}
                  </div>
                  <input
                    type="password"
                    required
                    minLength={8}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-sm text-white"
                  />
                </div>

                {mode === 'register' && (
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">
                      Confirm Password <span className="text-rose-400">*</span>
                    </label>
                    <input
                      type="password"
                      required
                      minLength={8}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Re-enter password"
                      className="w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-sm text-white"
                    />
                  </div>
                )}

                {mode === 'login' && (
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="rememberMe"
                      checked={rememberMe}
                      onChange={(e) => setRememberMe(e.target.checked)}
                      className="rounded bg-slate-950 border-slate-700 text-emerald-500 focus:ring-0"
                    />
                    <label htmlFor="rememberMe" className="text-xs text-slate-400 cursor-pointer">
                      Stay signed in on this device
                    </label>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading || googleLoading}
                  className="w-full py-2.5 px-4 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-semibold text-sm transition flex items-center justify-center gap-2"
                >
                  <Lock className="w-4 h-4" />
                  <span>
                    {loading
                      ? 'Authenticating...'
                      : mode === 'login'
                        ? 'Sign In to My Private Workspace'
                        : 'Create Isolated Personal Account'}
                  </span>
                </button>
              </form>
            ) : (
              /* Forgot / Reset Password Workflow */
              <div className="space-y-4">
                {forgotStep === 1 ? (
                  <form onSubmit={handleForgotPasswordRequest} className="space-y-4">
                    <p className="text-xs text-slate-300 leading-relaxed">
                      Enter the email address registered with your account. A secure 8-character verification reset code will be generated to restore access.
                    </p>
                    <div>
                      <label className="block text-xs font-medium text-slate-300 mb-1">
                        Registered Email Address
                      </label>
                      <input
                        type="email"
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="your.email@example.com"
                        className="w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-sm text-white"
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={loading}
                      className="w-full py-2.5 px-4 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-semibold text-sm transition flex items-center justify-center gap-2"
                    >
                      <KeyRound className="w-4 h-4" />
                      <span>{loading ? 'Generating Code...' : 'Send Password Reset Code'}</span>
                    </button>
                  </form>
                ) : (
                  <form onSubmit={handleResetPasswordSubmit} className="space-y-4">
                    {resetTokenHint && (
                      <div className="p-3 rounded-lg bg-amber-950/80 border border-amber-700/60 text-xs text-amber-200">
                        <div className="font-semibold mb-1">Reset Verification Code:</div>
                        <div className="font-mono text-base font-bold tracking-widest text-white">
                          {resetTokenHint}
                        </div>
                        <div className="text-[11px] text-amber-300/80 mt-1">
                          Valid for 1 hour. Enter this code below with your new password.
                        </div>
                      </div>
                    )}
                    <div>
                      <label className="block text-xs font-medium text-slate-300 mb-1">
                        8-Character Reset Code
                      </label>
                      <input
                        type="text"
                        required
                        value={resetToken}
                        onChange={(e) => setResetToken(e.target.value)}
                        placeholder="e.g. 9B3F4A12"
                        className="w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-sm text-white font-mono uppercase"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-300 mb-1">
                        New Password (min. 8 characters)
                      </label>
                      <input
                        type="password"
                        required
                        minLength={8}
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        className="w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-sm text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-300 mb-1">
                        Confirm New Password
                      </label>
                      <input
                        type="password"
                        required
                        minLength={8}
                        value={confirmNewPassword}
                        onChange={(e) => setConfirmNewPassword(e.target.value)}
                        className="w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-sm text-white"
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={loading}
                      className="w-full py-2.5 px-4 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-semibold text-sm transition flex items-center justify-center gap-2"
                    >
                      <Lock className="w-4 h-4" />
                      <span>{loading ? 'Updating Password...' : 'Reset Password & Sign In'}</span>
                    </button>
                  </form>
                )}
              </div>
            )}
          </div>
        </div>
      </main>

      <footer className="max-w-6xl w-full mx-auto pt-4 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
        <span>Saudi Salary Pro v2.0 • Personal Expatriate Employment Platform</span>
        <span>Calculations aligned with Saudi Labor Law (HRSD Articles 84–87, 107, 109, 111 & 117)</span>
      </footer>
    </div>
  );
};
