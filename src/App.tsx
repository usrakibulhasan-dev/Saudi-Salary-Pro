import React, { useEffect, useState } from 'react';
import {
  Award,
  Bell,
  BookOpen,
  Briefcase,
  Calendar,
  CheckSquare,
  Clock,
  Cloud,
  CreditCard,
  FileSpreadsheet,
  FileText,
  FolderLock,
  Globe,
  LayoutDashboard,
  LogOut,
  ShieldCheck,
  User,
  Users,
  Wallet,
  Calculator,
  KeyRound,
  Settings,
  X,
  Check,
  AlertCircle,
  Sun,
  Moon,
  Sparkles,
  ChevronRight,
} from 'lucide-react';
import { useTheme } from './theme/ThemeContext.tsx';
import { MODULE_THEMES } from './theme/designSystem.ts';
import { LANGUAGE_OPTIONS, TRANSLATIONS } from './i18n/translations.ts';
import type {
  PrimaryNavModule,
  SupportedLanguage,
  UserPrivateDatabaseSlice,
} from './types/payroll.ts';
import {
  apiDeleteRecord,
  apiFetchUserSlice,
  apiLinkGoogle,
  apiLogin,
  apiRestoreBackup,
  apiSetPassword,
  apiUnlinkGoogle,
  apiUpdateProfile,
  apiUpsertRecord,
  createBrowserFallbackSlice,
  fetchSystemStatus,
  getCachedSlice,
  getSavedToken,
  setCachedSlice,
  setSavedToken,
  type CollectionName,
  type SystemCapabilitiesStatus,
} from './storage/db.ts';
import { signOutFirebase, signInWithGooglePopup } from './services/googleAuthAndDrive.ts';
import { AuthView } from './components/AuthView.tsx';
import { DashboardAndProfileView } from './components/DashboardAndProfileView.tsx';
import { AttendanceOvertimeLeaveView } from './components/AttendanceOvertimeLeaveView.tsx';
import { LoansAndVacationView } from './components/LoansAndVacationView.tsx';
import { PayslipsReconciliationSettlementView } from './components/PayslipsReconciliationSettlementView.tsx';
import { VaultFinanceAssistantBackupView } from './components/VaultFinanceAssistantBackupView.tsx';
import { OvertimeSalaryCalculatorView } from './components/OvertimeSalaryCalculatorView.tsx';

export default function App() {
  const [slice, setSlice] = useState<UserPrivateDatabaseSlice | null>(() => {
    const cached = getCachedSlice();
    if (cached) return cached;
    const fallback = createBrowserFallbackSlice('rahim.khan@example.sa');
    setCachedSlice(fallback);
    return fallback;
  });
  const [language, setLanguage] = useState<SupportedLanguage>('en');
  const [activeModule, setActiveModule] = useState<PrimaryNavModule>('dashboard');
  const [selectedMonth, setSelectedMonth] = useState<string>('2026-03');
  const [systemStatus, setSystemStatus] = useState<SystemCapabilitiesStatus | null>(null);
  const [loadingInitial, setLoadingInitial] = useState<boolean>(false);
  const [switchingAccount, setSwitchingAccount] = useState<boolean>(false);
  const [toastMsg, setToastMsg] = useState<{ text: string; type: 'success' | 'warning' | 'info' } | null>(
    null,
  );

  const notify = (text: string, type: 'success' | 'warning' | 'info' = 'success') => {
    setToastMsg({ text, type });
    setTimeout(() => setToastMsg(null), 5000);
  };

  const langOption = LANGUAGE_OPTIONS.find((l) => l.code === language) || LANGUAGE_OPTIONS[0];
  const t = TRANSLATIONS[language];

  useEffect(() => {
    document.documentElement.dir = langOption.dir;
    document.documentElement.lang = langOption.code;
  }, [langOption]);

  useEffect(() => {
    let mounted = true;
    async function bootstrap() {
      try {
        const status = await fetchSystemStatus().catch(() => null);
        if (mounted && status) setSystemStatus(status);

        const existingToken = getSavedToken();
        if (existingToken && !existingToken.startsWith('local-token-')) {
          try {
            const freshSlice = await apiFetchUserSlice();
            if (mounted) {
              setSlice(freshSlice);
              setLanguage(freshSlice.profile.preferredLanguage || 'en');
            }
            return;
          } catch {
            // Token expired or server restarted; fall through to re-authenticate demo user
          }
        }

        const cachedEmail = getCachedSlice()?.user?.email || 'rahim.khan@example.sa';
        const demoEmail =
          cachedEmail === 'carlo.reyes@example.sa'
            ? 'carlo.reyes@example.sa'
            : 'rahim.khan@example.sa';
        const autoDemo = await apiLogin(demoEmail, 'SaudiPro#2026');
        if (mounted) {
          setSlice(autoDemo.slice);
          setLanguage(autoDemo.slice.profile.preferredLanguage || 'en');
        }
      } catch {
        // If unauthenticated, show AuthView
        if (mounted) setSavedToken(null);
      } finally {
        if (mounted) setLoadingInitial(false);
      }
    }
    bootstrap();
    return () => {
      mounted = false;
    };
  }, []);

  const refreshSlice = async () => {
    const immediate = getCachedSlice();
    if (immediate) {
      setSlice(immediate);
    }
    const updated = await apiFetchUserSlice();
    setSlice(updated);
  };

  const handleSwitchDemoAccount = async () => {
    if (!slice) return;
    setSwitchingAccount(true);
    try {
      const nextEmail =
        slice.user.email === 'rahim.khan@example.sa'
          ? 'carlo.reyes@example.sa'
          : 'rahim.khan@example.sa';
      const res = await apiLogin(nextEmail, 'SaudiPro#2026');
      setSlice(res.slice);
    } finally {
      setSwitchingAccount(false);
    }
  };

  const [showAccountModal, setShowAccountModal] = useState<boolean>(false);
  const [newAccPassword, setNewAccPassword] = useState<string>('');
  const [confirmAccPassword, setConfirmAccPassword] = useState<string>('');
  const [accError, setAccError] = useState<string | null>(null);
  const [accSuccess, setAccSuccess] = useState<string | null>(null);
  const [accLoading, setAccLoading] = useState<boolean>(false);

  const handleSignOut = async () => {
    await signOutFirebase();
    setSavedToken(null);
    setSlice(null);
  };

  const handleSetOrChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setAccError(null);
    setAccSuccess(null);
    if (!newAccPassword || newAccPassword.length < 8) {
      setAccError('Password must be at least 8 characters long.');
      return;
    }
    if (newAccPassword !== confirmAccPassword) {
      setAccError('Passwords do not match.');
      return;
    }
    setAccLoading(true);
    try {
      const updatedSlice = await apiSetPassword(newAccPassword);
      setSlice(updatedSlice);
      setAccSuccess('Password updated successfully! You can now sign in using this password.');
      setNewAccPassword('');
      setConfirmAccPassword('');
    } catch (err) {
      setAccError(err instanceof Error ? err.message : 'Failed to update password.');
    } finally {
      setAccLoading(false);
    }
  };

  const handleLinkGoogleAccount = async () => {
    setAccError(null);
    setAccSuccess(null);
    setAccLoading(true);
    try {
      const googleUser = await signInWithGooglePopup();
      const updatedSlice = await apiLinkGoogle({
        email: googleUser.email,
        googleId: googleUser.googleId,
        photoUrl: googleUser.photoUrl,
      });
      setSlice(updatedSlice);
      setAccSuccess(`Successfully linked Google account: ${googleUser.email}`);
    } catch (err) {
      setAccError(err instanceof Error ? err.message : 'Failed to link Google account.');
    } finally {
      setAccLoading(false);
    }
  };

  const handleUnlinkGoogleAccount = async () => {
    setAccError(null);
    setAccSuccess(null);
    setAccLoading(true);
    try {
      const updatedSlice = await apiUnlinkGoogle();
      setSlice(updatedSlice);
      setAccSuccess('Google account unlinked successfully.');
    } catch (err) {
      setAccError(err instanceof Error ? err.message : 'Failed to unlink Google account.');
    } finally {
      setAccLoading(false);
    }
  };

  if (loadingInitial && !slice) {
    return (
      <div className="min-h-screen bg-[#0B111E] text-slate-200 flex items-center justify-center p-6">
        <div className="text-sm font-mono text-emerald-400">
          Loading Saudi Salary Pro v2.0 Personal Workspace...
        </div>
      </div>
    );
  }

  if (!slice) {
    return (
      <AuthView
        language={language}
        onLanguageChange={setLanguage}
        onAuthenticated={(newSlice) => {
          setSlice(newSlice);
          setLanguage(newSlice.profile.preferredLanguage || language);
        }}
      />
    );
  }

  const navItems: { id: PrimaryNavModule; label: string; icon: React.ReactNode }[] = [
    { id: 'dashboard', label: t.navDashboard, icon: <LayoutDashboard className="w-4 h-4" /> },
    { id: 'profile', label: t.navProfile, icon: <User className="w-4 h-4" /> },
    { id: 'employment', label: t.navContracts, icon: <Briefcase className="w-4 h-4" /> },
    { id: 'attendance', label: t.navAttendance, icon: <Calendar className="w-4 h-4" /> },
    { id: 'overtime', label: t.navOvertime, icon: <Clock className="w-4 h-4" /> },
    { id: 'leave', label: t.navLeave, icon: <CheckSquare className="w-4 h-4" /> },
    { id: 'loans', label: t.navLoans, icon: <CreditCard className="w-4 h-4" /> },
    { id: 'overtime_salary_calculator', label: t.navOvertimeCalculator, icon: <Calculator className="w-4 h-4" /> },
    { id: 'payslips', label: t.navPayslips, icon: <FileText className="w-4 h-4" /> },
    { id: 'reconciliation', label: t.navReconciliation, icon: <ShieldCheck className="w-4 h-4" /> },
    { id: 'eosb', label: t.navEOSB, icon: <Award className="w-4 h-4" /> },
    { id: 'settlement', label: t.navSettlement, icon: <FileSpreadsheet className="w-4 h-4" /> },
    { id: 'documents', label: t.navDocuments, icon: <FolderLock className="w-4 h-4" /> },
    { id: 'finance', label: t.navFinance, icon: <Wallet className="w-4 h-4" /> },
    { id: 'reports', label: t.navReports, icon: <FileSpreadsheet className="w-4 h-4" /> },
    { id: 'reminders', label: t.navReminders, icon: <Bell className="w-4 h-4" /> },
    { id: 'backup', label: t.navBackup, icon: <Cloud className="w-4 h-4" /> },
    { id: 'assistant', label: t.navAssistant, icon: <BookOpen className="w-4 h-4" /> },
  ];

  const { theme, toggleTheme, isDark } = useTheme();

  const navCategories = [
    {
      name: 'Core Employment',
      items: navItems.filter((i) =>
        ['dashboard', 'profile', 'employment', 'attendance', 'overtime', 'leave'].includes(i.id),
      ),
    },
    {
      name: 'Payroll & Financials',
      items: navItems.filter((i) =>
        ['overtime_salary_calculator', 'loans', 'payslips', 'reconciliation', 'eosb', 'settlement', 'finance'].includes(i.id),
      ),
    },
    {
      name: 'Legal & Records',
      items: navItems.filter((i) => ['documents', 'reports', 'assistant'].includes(i.id)),
    },
    {
      name: 'System & Security',
      items: navItems.filter((i) => ['reminders', 'backup'].includes(i.id)),
    },
  ];

  const userInitials = (slice.profile.displayName || slice.user.fullName || 'User')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0].toUpperCase())
    .join('');

  return (
    <div
      style={{ fontFamily: langOption.fontFamily }}
      className={`min-h-screen ${
        isDark ? 'dark bg-[#0B111E] text-slate-100' : 'bg-[#F6F8FC] text-slate-800'
      } flex flex-col transition-colors duration-200`}
    >
      {/* Top Application Bar */}
      <header
        className={`sticky top-0 z-30 ${
          isDark
            ? 'bg-[#0E1726]/95 border-slate-800/80 text-white'
            : 'bg-white/95 border-slate-200/80 text-slate-900'
        } backdrop-blur border-b px-4 lg:px-6 py-2.5 shadow-xs`}
      >
        <div className="max-w-[1600px] mx-auto flex flex-wrap items-center justify-between gap-3">
          {/* Logo & Identity */}
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-[#3B5BDB] via-[#6658E8] to-[#55C2FF] flex items-center justify-center text-white font-black text-sm shadow-sm ring-2 ring-indigo-500/20">
              SSP
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1
                  className={`text-sm sm:text-base font-extrabold tracking-tight ${
                    isDark ? 'text-white' : 'text-slate-900'
                  }`}
                >
                  {t.appName}
                </h1>
                <span
                  className={`hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-full ${
                    isDark
                      ? 'bg-emerald-950/70 border border-emerald-700/60 text-emerald-300'
                      : 'bg-emerald-50 border border-emerald-300 text-emerald-700'
                  } text-[11px] font-semibold shadow-2xs`}
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                  <ShieldCheck className="w-3 h-3 text-emerald-500" />
                  <span>Private Workspace</span>
                </span>
              </div>
              <p
                className={`text-[11px] ${
                  isDark ? 'text-slate-400' : 'text-slate-500'
                } hidden md:block`}
              >
                Personal Expatriate Employment Platform • Saudi Labor Law
              </p>
            </div>
          </div>

          {/* Quick Actions & Controls */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Theme Toggle Button */}
            <button
              type="button"
              onClick={toggleTheme}
              className={`p-1.5 sm:px-2.5 sm:py-1.5 rounded-lg ${
                isDark
                  ? 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-200'
                  : 'bg-slate-100 hover:bg-slate-200 border-slate-200 text-slate-700'
              } border text-xs font-semibold flex items-center gap-1.5 transition shadow-2xs cursor-pointer`}
              title={`Switch to ${isDark ? 'Light' : 'Dark'} Mode`}
              aria-label="Toggle Color Theme"
            >
              {isDark ? (
                <>
                  <Sun className="w-3.5 h-3.5 text-amber-400" />
                  <span className="hidden sm:inline">Light</span>
                </>
              ) : (
                <>
                  <Moon className="w-3.5 h-3.5 text-indigo-600" />
                  <span className="hidden sm:inline">Dark</span>
                </>
              )}
            </button>

            {/* 1-Click Demo Account Switcher */}
            <button
              type="button"
              disabled={switchingAccount}
              onClick={handleSwitchDemoAccount}
              className={`px-2.5 py-1.5 rounded-lg ${
                isDark
                  ? 'bg-amber-950/50 hover:bg-amber-900/60 border-amber-700/60 text-amber-300'
                  : 'bg-amber-50 hover:bg-amber-100 border-amber-300 text-amber-800'
              } border text-xs font-semibold inline-flex items-center gap-1.5 transition shadow-2xs cursor-pointer`}
              title="Switch user to verify complete server-side data isolation"
            >
              <Users className="w-3.5 h-3.5 text-amber-500" />
              <span className="hidden md:inline">
                {switchingAccount ? 'Switching...' : t.switchDemoAccount}
              </span>
            </button>

            {/* 9-Language Selector */}
            <div
              className={`flex items-center gap-1.5 ${
                isDark
                  ? 'bg-slate-800 border-slate-700 text-slate-200'
                  : 'bg-slate-100 border-slate-200 text-slate-700'
              } border rounded-lg px-2.5 py-1 shadow-2xs`}
            >
              <Globe className="w-3.5 h-3.5 text-indigo-500" />
              <select
                aria-label="Language"
                value={language}
                onChange={(e) => setLanguage(e.target.value as SupportedLanguage)}
                className="bg-transparent text-xs font-medium focus:outline-none cursor-pointer"
              >
                {LANGUAGE_OPTIONS.map((opt) => (
                  <option
                    key={opt.code}
                    value={opt.code}
                    className={isDark ? 'bg-slate-900 text-white' : 'bg-white text-slate-800'}
                  >
                    {opt.nativeLabel}
                  </option>
                ))}
              </select>
            </div>

            {/* Active User Avatar & Settings Trigger */}
            <button
              type="button"
              onClick={() => {
                setAccError(null);
                setAccSuccess(null);
                setShowAccountModal(true);
              }}
              className={`px-2.5 py-1 rounded-lg ${
                isDark
                  ? 'bg-slate-800/80 hover:bg-slate-800 border-slate-700 text-white'
                  : 'bg-white hover:bg-slate-50 border-slate-200 text-slate-900'
              } border text-xs flex items-center gap-2 transition cursor-pointer shadow-2xs`}
              title="Click to view Account & Security Settings"
            >
              <div className="w-5 h-5 rounded-full bg-gradient-to-tr from-[#3B5BDB] to-[#13B8A6] flex items-center justify-center text-[10px] font-bold text-white shrink-0">
                {userInitials}
              </div>
              <span className="font-semibold max-w-[120px] truncate">
                {slice.profile.displayName || slice.user.fullName}
              </span>
              <Settings className="w-3 h-3 text-slate-400" />
            </button>

            {/* Sign Out */}
            <button
              type="button"
              onClick={handleSignOut}
              className={`p-1.5 sm:px-2.5 sm:py-1.5 rounded-lg ${
                isDark
                  ? 'bg-slate-800 hover:bg-rose-950/50 border-slate-700 hover:border-rose-800/60 text-slate-300 hover:text-rose-300'
                  : 'bg-slate-100 hover:bg-rose-50 border-slate-200 hover:border-rose-300 text-slate-600 hover:text-rose-600'
              } border text-xs inline-flex items-center gap-1 transition shadow-2xs cursor-pointer`}
              title="Sign Out"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{t.signOut}</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Layout: Sidebar + Workspace */}
      <div className="max-w-[1600px] w-full mx-auto flex-1 flex flex-col lg:flex-row gap-6 p-4 lg:p-6">
        {/* Navigation Sidebar */}
        <aside className="lg:w-64 shrink-0">
          <nav
            aria-label="Primary Modules"
            className={`flex lg:flex-col gap-3 overflow-x-auto pb-2 lg:pb-0 ${
              isDark ? 'bg-[#131B2E] border-slate-800/80' : 'bg-white border-slate-200'
            } border rounded-2xl p-3 shadow-xs`}
          >
            {navCategories.map((cat) => (
              <div key={cat.name} className="flex lg:flex-col gap-1 min-w-max lg:min-w-0">
                <div
                  className={`hidden lg:block px-2.5 pt-1 pb-1 text-[10px] font-bold uppercase tracking-wider ${
                    isDark ? 'text-slate-500' : 'text-slate-400'
                  }`}
                >
                  {cat.name}
                </div>
                {cat.items.map((item) => {
                  const active = activeModule === item.id;
                  const themeMod = MODULE_THEMES[item.id];
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setActiveModule(item.id)}
                      className={`flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition cursor-pointer ${
                        active
                          ? 'bg-gradient-to-r from-[#3B5BDB] to-[#6658E8] text-white shadow-sm ring-1 ring-indigo-500/30'
                          : isDark
                            ? 'text-slate-300 hover:bg-slate-800/70 hover:text-white'
                            : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <span
                          className={`p-1 rounded-lg ${
                            active
                              ? 'text-white'
                              : isDark
                                ? 'text-slate-400'
                                : 'text-slate-500'
                          }`}
                        >
                          {item.icon}
                        </span>
                        <span>{item.label}</span>
                      </div>
                      {themeMod && !active && (
                        <span
                          className="w-1.5 h-1.5 rounded-full opacity-60 hidden lg:inline-block"
                          style={{ backgroundColor: themeMod.accentColor }}
                        />
                      )}
                    </button>
                  );
                })}
              </div>
            ))}
          </nav>
        </aside>

        {/* Active Module Content Area */}
        <main className="flex-1 min-w-0">
          {toastMsg && (
            <div
              className={`mb-4 px-4 py-2.5 rounded-xl border text-xs font-semibold flex items-center justify-between ${
                toastMsg.type === 'warning'
                  ? 'bg-amber-950/80 border-amber-700 text-amber-200'
                  : toastMsg.type === 'info'
                    ? 'bg-blue-950/80 border-blue-700 text-blue-200'
                    : 'bg-emerald-950/80 border-emerald-700 text-emerald-200'
              }`}
            >
              <span>{toastMsg.text}</span>
              <button
                type="button"
                onClick={() => setToastMsg(null)}
                className="text-slate-400 hover:text-white ml-3"
              >
                ✕
              </button>
            </div>
          )}

          {(activeModule === 'dashboard' ||
            activeModule === 'profile' ||
            activeModule === 'employment') && (
            <DashboardAndProfileView
              activeTab={activeModule}
              slice={slice}
              selectedMonth={selectedMonth}
              onNavigate={setActiveModule}
              notify={notify}
              onUpdateProfile={async (updates) => {
                await apiUpdateProfile(updates);
                await refreshSlice();
              }}
              onSaveEmployment={async (emp) => {
                await apiUpsertRecord('employments', emp as never);
                await refreshSlice();
              }}
              onDeleteEmployment={async (id) => {
                await apiDeleteRecord('employments', id);
                await refreshSlice();
              }}
              onSaveSalaryVersion={async (ver) => {
                await apiUpsertRecord('salaryVersions', ver as never);
                await refreshSlice();
              }}
              onDeleteSalaryVersion={async (id) => {
                await apiDeleteRecord('salaryVersions', id);
                await refreshSlice();
              }}
            />
          )}

          {(activeModule === 'leave' || activeModule === 'loans') && (
            <LoansAndVacationView
              activeTab={activeModule}
              slice={slice}
              selectedMonth={selectedMonth}
              setSelectedMonth={setSelectedMonth}
              onSaveRecord={async <T extends { id: string; userId: string }>(
                collection: CollectionName,
                record: Omit<T, 'id' | 'userId'> & { id?: string; userId?: string },
              ): Promise<T> => {
                const saved = await apiUpsertRecord<T>(collection, record);
                await refreshSlice();
                return saved;
              }}
              onDeleteRecord={async (collection, id) => {
                await apiDeleteRecord(collection, id);
                await refreshSlice();
              }}
              notify={notify}
            />
          )}

          {(activeModule === 'attendance' ||
            activeModule === 'overtime' ||
            activeModule === 'reports') && (
            <AttendanceOvertimeLeaveView
              activeTab={activeModule}
              slice={slice}
              selectedMonth={selectedMonth}
              onMonthChange={setSelectedMonth}
              notify={notify}
              onSaveAttendance={async (rec) => {
                await apiUpsertRecord('attendance', rec as never);
                await refreshSlice();
              }}
              onDeleteAttendance={async (id) => {
                await apiDeleteRecord('attendance', id);
                await refreshSlice();
              }}
              onSaveOvertime={async (rec) => {
                await apiUpsertRecord('overtimeLedger', rec as never);
                await refreshSlice();
              }}
              onDeleteOvertime={async (id) => {
                await apiDeleteRecord('overtimeLedger', id);
                await refreshSlice();
              }}
              onSaveLeave={async (rec) => {
                await apiUpsertRecord('leaves', rec as never);
                await refreshSlice();
              }}
              onDeleteLeave={async (id) => {
                await apiDeleteRecord('leaves', id);
                await refreshSlice();
              }}
            />
          )}

          {activeModule === 'overtime_salary_calculator' && (
            <OvertimeSalaryCalculatorView
              slice={slice}
              onSaveRecord={async <T extends { id: string; userId: string }>(
                collection: CollectionName,
                record: Omit<T, 'id' | 'userId'> & { id?: string; userId?: string },
              ): Promise<T> => {
                const saved = await apiUpsertRecord<T>(collection, record);
                await refreshSlice();
                return saved;
              }}
              onDeleteRecord={async (collection, id) => {
                await apiDeleteRecord(collection, id);
                await refreshSlice();
              }}
              notify={notify}
            />
          )}

          {(activeModule === 'payslips' ||
            activeModule === 'reconciliation' ||
            activeModule === 'eosb' ||
            activeModule === 'settlement') && (
            <PayslipsReconciliationSettlementView
              activeTab={activeModule}
              slice={slice}
              selectedMonth={selectedMonth}
              onMonthChange={setSelectedMonth}
              notify={notify}
              onSavePayslip={async (slip) => {
                await apiUpsertRecord('payslips', slip as never);
                await refreshSlice();
              }}
              onDeletePayslip={async (id) => {
                await apiDeleteRecord('payslips', id);
                await refreshSlice();
              }}
            />
          )}

          {(activeModule === 'documents' ||
            activeModule === 'finance' ||
            activeModule === 'reminders' ||
            activeModule === 'backup' ||
            activeModule === 'assistant') && (
            <VaultFinanceAssistantBackupView
              activeTab={activeModule}
              slice={slice}
              selectedMonth={selectedMonth}
              systemStatus={systemStatus}
              notify={notify}
              onSaveDocument={async (doc) => {
                await apiUpsertRecord('documents', doc as never);
                await refreshSlice();
              }}
              onDeleteDocument={async (id) => {
                await apiDeleteRecord('documents', id);
                await refreshSlice();
              }}
              onSaveReminder={async (rem) => {
                await apiUpsertRecord('reminders', rem as never);
                await refreshSlice();
              }}
              onDeleteReminder={async (id) => {
                await apiDeleteRecord('reminders', id);
                await refreshSlice();
              }}
              onSaveFinance={async (fin) => {
                await apiUpsertRecord('finance', fin as never);
                await refreshSlice();
              }}
              onDeleteFinance={async (id) => {
                await apiDeleteRecord('finance', id);
                await refreshSlice();
              }}
              onRestoreBackup={async (backupSlice) => {
                const updated = await apiRestoreBackup(backupSlice);
                setSlice(updated);
              }}
              onProfileUpdated={refreshSlice}
            />
          )}
        </main>
      </div>

      {/* Account & Security Settings Modal */}
      {showAccountModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="max-w-xl w-full bg-white dark:bg-[#131B2E] border border-slate-200 dark:border-slate-800 rounded-2xl p-6 space-y-5 shadow-2xl text-slate-800 dark:text-slate-100">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white">
                    Account & Security Settings
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Manage connected sign-in accounts, password credentials, and cloud backup.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowAccountModal(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-white p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {accError && (
              <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/70 border border-rose-200 dark:border-rose-700/60 text-xs text-rose-700 dark:text-rose-200 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-500 mt-0.5" />
                <span>{accError}</span>
              </div>
            )}

            {accSuccess && (
              <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/70 border border-emerald-200 dark:border-emerald-700/60 text-xs text-emerald-700 dark:text-emerald-200 flex items-start gap-2">
                <Check className="w-4 h-4 shrink-0 text-emerald-500 mt-0.5" />
                <span>{accSuccess}</span>
              </div>
            )}

            {/* Profile Overview */}
            <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 grid grid-cols-2 gap-3 text-xs">
              <div>
                <span className="text-slate-500 dark:text-slate-400 block text-[11px]">User Account</span>
                <span className="font-semibold text-slate-900 dark:text-white">{slice.user.fullName}</span>
              </div>
              <div>
                <span className="text-slate-500 dark:text-slate-400 block text-[11px]">Primary Email</span>
                <span className="font-mono text-slate-900 dark:text-white truncate block">{slice.user.email}</span>
              </div>
            </div>

            {/* Connected Sign-In Methods */}
            <div className="space-y-3">
              <h4 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                Connected Authentication Methods
              </h4>

              {/* Google Account */}
              <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3 text-xs">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-white border border-slate-200 shadow-2xs flex items-center justify-center shrink-0">
                    <svg className="w-4 h-4" viewBox="0 0 24 24">
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
                  </div>
                  <div>
                    <div className="font-semibold text-slate-900 dark:text-white">Google Identity</div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400">
                      {slice.profile.googleConnected
                        ? `Connected (${slice.profile.googleEmail || slice.user.email})`
                        : 'Not connected to Google'}
                    </div>
                  </div>
                </div>

                <div>
                  {slice.profile.googleConnected ? (
                    <button
                      type="button"
                      disabled={accLoading || !slice.profile.hasPassword}
                      onClick={handleUnlinkGoogleAccount}
                      title={
                        !slice.profile.hasPassword
                          ? 'Set a manual password below before disconnecting Google'
                          : 'Disconnect Google sign-in'
                      }
                      className="px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-rose-50 dark:bg-slate-800 dark:hover:bg-rose-950/60 border border-slate-200 dark:border-slate-700 text-xs text-slate-700 hover:text-rose-600 dark:text-slate-300 dark:hover:text-rose-200 disabled:opacity-50 transition"
                    >
                      Disconnect
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={accLoading}
                      onClick={handleLinkGoogleAccount}
                      className="px-2.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-xs font-semibold text-white transition shadow-xs"
                    >
                      Connect Google
                    </button>
                  )}
                </div>
              </div>

              {/* Password Credentials */}
              <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-3 text-xs">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <KeyRound className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                    <span className="font-semibold text-slate-900 dark:text-white">Email & Password Sign-In</span>
                  </div>
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                      slice.profile.hasPassword
                        ? 'bg-emerald-50 dark:bg-emerald-950 border border-emerald-300 dark:border-emerald-700 text-emerald-700 dark:text-emerald-300'
                        : 'bg-amber-50 dark:bg-amber-950 border border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-300'
                    }`}
                  >
                    {slice.profile.hasPassword ? 'ACTIVE' : 'NO PASSWORD SET'}
                  </span>
                </div>

                <form onSubmit={handleSetOrChangePassword} className="space-y-3 pt-1">
                  <div className="text-[11px] text-slate-500 dark:text-slate-400">
                    {slice.profile.hasPassword
                      ? 'You can change your password anytime:'
                      : 'You signed in via Google. Set a personal password so you can also sign in manually with your email:'}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <input
                      type="password"
                      required
                      minLength={8}
                      placeholder="New password (min 8 chars)"
                      value={newAccPassword}
                      onChange={(e) => setNewAccPassword(e.target.value)}
                      className="rounded-lg bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 px-2.5 py-1.5 text-xs text-slate-900 dark:text-white"
                    />
                    <input
                      type="password"
                      required
                      minLength={8}
                      placeholder="Confirm new password"
                      value={confirmAccPassword}
                      onChange={(e) => setConfirmAccPassword(e.target.value)}
                      className="rounded-lg bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 px-2.5 py-1.5 text-xs text-slate-900 dark:text-white"
                    />
                  </div>
                  <div className="flex justify-end">
                    <button
                      type="submit"
                      disabled={accLoading}
                      className="px-3 py-1.5 rounded-lg bg-gradient-to-r from-[#3B5BDB] to-[#6658E8] hover:opacity-90 disabled:opacity-50 text-xs font-semibold text-white transition shadow-xs"
                    >
                      {accLoading
                        ? 'Saving...'
                        : slice.profile.hasPassword
                          ? 'Update Password'
                          : 'Set Password'}
                    </button>
                  </div>
                </form>
              </div>

              {/* Cloud Backup Quick Link */}
              <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs">
                <div>
                  <div className="font-semibold text-slate-900 dark:text-white">Google Drive Personal Backup</div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400">
                    {slice.profile.googleDriveConnected
                      ? `Connected to folder "Saudi Salary Pro Backups"`
                      : 'Not connected'}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setActiveModule('backup');
                    setShowAccountModal(false);
                  }}
                  className="px-3 py-1.5 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 hover:bg-indigo-100 border border-indigo-200 dark:border-indigo-800 text-xs font-semibold text-indigo-700 dark:text-indigo-300 transition"
                >
                  Manage Backups
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between border-t border-slate-200 dark:border-slate-800 pt-3">
              <button
                type="button"
                onClick={handleSignOut}
                className="px-3 py-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/60 dark:hover:bg-rose-900/80 border border-rose-200 dark:border-rose-700/60 text-xs font-semibold text-rose-700 dark:text-rose-200 transition"
              >
                Sign Out from All Devices
              </button>
              <button
                type="button"
                onClick={() => setShowAccountModal(false)}
                className="px-4 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-300"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
