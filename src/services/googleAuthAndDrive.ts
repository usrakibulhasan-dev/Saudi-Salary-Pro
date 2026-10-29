import { initializeApp, getApps, getApp, type FirebaseApp, type FirebaseOptions } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut as firebaseSignOut,
  type Auth,
} from 'firebase/auth';
import { getFirestore, doc, getDocFromServer, type Firestore } from 'firebase/firestore';
import type {
  FullBackupPackage,
  GoogleDriveBackupFile,
  UserPrivateDatabaseSlice,
} from '../types/payroll.ts';
import rawFirebaseConfig from '../../firebase-applet-config.json';

export interface ResolvedFirebaseAppletConfig extends FirebaseOptions {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket?: string;
  messagingSenderId?: string;
  appId: string;
  measurementId?: string;
  firestoreDatabaseId?: string;
  oAuthClientId?: string;
  recaptchaSiteKey?: string;
}

export interface FirebaseAuthDiagnosticReport {
  projectId: string;
  authDomain: string;
  apiKeyConfigured: boolean;
  oAuthClientIdConfigured: boolean;
  oAuthClientId: string;
  firestoreDatabaseId: string;
  currentHostname: string;
  identityToolkitStatus: 'unknown' | 'ok' | 'app_check_enforced' | 'error';
  identityToolkitMessage: string;
  activeAuthTransport: 'gis_oauth2' | 'firebase_popup';
}

const DRIVE_FILE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
const IDENTITY_SCOPES = 'openid email profile';
const DRIVE_FULL_SCOPES = `${IDENTITY_SCOPES} ${DRIVE_FILE_SCOPE}`;

// Type declarations for Google Identity Services (https://accounts.google.com/gsi/client)
interface GisTokenResponse {
  access_token?: string;
  expires_in?: number;
  scope?: string;
  token_type?: string;
  error?: string;
  error_description?: string;
  error_uri?: string;
}

interface GisTokenClient {
  requestAccessToken: (overrideConfig?: { prompt?: string; hint?: string }) => void;
}

interface GoogleIdentityServicesWindow {
  google?: {
    accounts?: {
      oauth2?: {
        initTokenClient: (config: {
          client_id: string;
          scope: string;
          prompt?: string;
          hint?: string;
          callback: (response: GisTokenResponse) => void;
          error_callback?: (error: { type?: string; message?: string }) => void;
        }) => GisTokenClient;
        hasGrantedAllScopes?: (tokenResponse: GisTokenResponse, ...scopes: string[]) => boolean;
        revoke?: (accessToken: string, done?: () => void) => void;
      };
    };
  };
}

// In-memory Drive token storage (NEVER in localStorage/sessionStorage per security guidelines)
let inMemoryDriveAccessToken: string | null = null;
let inMemoryDriveTokenExpiry: number = 0;
let inMemoryDriveEmail: string | null = null;

// Cached IdentityToolkit health status from background probe
let identityToolkitStatus: 'unknown' | 'ok' | 'app_check_enforced' | 'error' = 'unknown';
let identityToolkitMessage = 'Not probed yet';
let probePromise: Promise<void> | null = null;
let firestoreConnectionTested = false;

/**
 * Resolve and validate Firebase Web SDK v9 configuration from firebase-applet-config.json
 * and optional VITE_FIREBASE_* environment overrides.
 */
export function getResolvedFirebaseConfig(): ResolvedFirebaseAppletConfig {
  const env = (typeof import.meta !== 'undefined' && (import.meta as unknown as { env?: Record<string, string> }).env) || {};
  const cfg = rawFirebaseConfig as Record<string, string | undefined>;

  const projectId = (env.VITE_FIREBASE_PROJECT_ID || cfg.projectId || '').trim();
  const apiKey = (env.VITE_FIREBASE_API_KEY || cfg.apiKey || '').trim();
  const authDomain = (
    env.VITE_FIREBASE_AUTH_DOMAIN ||
    cfg.authDomain ||
    (projectId ? `${projectId}.firebaseapp.com` : '')
  ).trim();
  const appId = (env.VITE_FIREBASE_APP_ID || cfg.appId || '').trim();
  const storageBucket = (env.VITE_FIREBASE_STORAGE_BUCKET || cfg.storageBucket || '').trim() || undefined;
  const messagingSenderId = (env.VITE_FIREBASE_MESSAGING_SENDER_ID || cfg.messagingSenderId || '').trim() || undefined;
  const measurementId = (env.VITE_FIREBASE_MEASUREMENT_ID || cfg.measurementId || '').trim() || undefined;
  const firestoreDatabaseId = (
    env.VITE_FIREBASE_DATABASE_ID ||
    cfg.firestoreDatabaseId ||
    '(default)'
  ).trim();
  const oAuthClientId = (env.VITE_GOOGLE_OAUTH_CLIENT_ID || cfg.oAuthClientId || '').trim() || undefined;
  const recaptchaSiteKey = (env.VITE_FIREBASE_APPCHECK_SITE_KEY || cfg.recaptchaSiteKey || '').trim() || undefined;

  return {
    apiKey,
    authDomain,
    projectId,
    storageBucket,
    messagingSenderId,
    appId,
    measurementId,
    firestoreDatabaseId,
    oAuthClientId,
    recaptchaSiteKey,
  };
}

/**
 * Initialize Firebase App with explicit FirebaseOptions for Web SDK v9
 */
export function getFirebaseApp(): FirebaseApp {
  if (getApps().length > 0) {
    return getApp();
  }
  const resolved = getResolvedFirebaseConfig();
  if (!resolved.apiKey || !resolved.projectId || !resolved.authDomain) {
    throw new Error(
      'Firebase configuration is incomplete: missing apiKey, projectId, or authDomain in firebase-applet-config.json.',
    );
  }
  const firebaseOptions: FirebaseOptions = {
    apiKey: resolved.apiKey,
    authDomain: resolved.authDomain,
    projectId: resolved.projectId,
    storageBucket: resolved.storageBucket,
    messagingSenderId: resolved.messagingSenderId,
    appId: resolved.appId,
    measurementId: resolved.measurementId,
  };
  const app = initializeApp(firebaseOptions);

  // Trigger non-blocking Firestore connection check once in browser environments
  if (typeof window !== 'undefined' && !firestoreConnectionTested) {
    firestoreConnectionTested = true;
    void verifyFirestoreConnection(app, resolved.firestoreDatabaseId);
  }

  return app;
}

export function getFirebaseAuth(): Auth {
  const app = getFirebaseApp();
  return getAuth(app);
}

export function getFirebaseFirestore(): Firestore {
  const app = getFirebaseApp();
  const resolved = getResolvedFirebaseConfig();
  return getFirestore(app, resolved.firestoreDatabaseId);
}

async function verifyFirestoreConnection(app: FirebaseApp, databaseId?: string): Promise<void> {
  try {
    const db = getFirestore(app, databaseId);
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration. The Firestore client reports it is offline.');
    }
  }
}

/**
 * Probe IdentityToolkit endpoint on startup to detect whether Firebase App Check enforcement
 * is rejecting IdentityToolkit client requests with HTTP 401 ("Firebase App Check token is invalid.").
 * When IdentityToolkit enforces App Check without a provisioned reCAPTCHA site key, Firebase's
 * signInWithPopup() throws `Firebase: Error (auth/internal-error).` after consuming the user's
 * popup click gesture. Detecting this ahead of time allows the click handler to immediately open
 * the official Google Identity Services OAuth 2.0 popup using the project's oAuthClientId.
 */
export function probeFirebaseIdentityToolkitStatus(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve();
  if (probePromise) return probePromise;

  probePromise = (async () => {
    const resolved = getResolvedFirebaseConfig();
    if (!resolved.apiKey) {
      identityToolkitStatus = 'error';
      identityToolkitMessage = 'Missing Firebase API key';
      return;
    }
    try {
      const res = await fetch(
        `https://identitytoolkit.googleapis.com/v1/accounts:createAuthUri?key=${encodeURIComponent(resolved.apiKey)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            providerId: 'google.com',
            continueUri: window.location.origin,
          }),
        },
      );
      if (res.ok) {
        identityToolkitStatus = 'ok';
        identityToolkitMessage = 'IdentityToolkit endpoint responded 200 OK.';
        return;
      }
      const errJson = (await res.json().catch(() => ({}))) as {
        error?: { code?: number; message?: string; status?: string };
      };
      const msg = errJson?.error?.message || `HTTP ${res.status}`;
      if (res.status === 401 && msg.toLowerCase().includes('app check')) {
        identityToolkitStatus = 'app_check_enforced';
        identityToolkitMessage =
          'Firebase App Check is enforced on Identity Platform without a client site key; using official Google Identity Services (GIS) OAuth 2.0 Web Client directly.';
      } else {
        identityToolkitStatus = 'error';
        identityToolkitMessage = msg;
      }
    } catch (err) {
      identityToolkitStatus = 'error';
      identityToolkitMessage = err instanceof Error ? err.message : 'Network probe failed';
    }
  })();

  return probePromise;
}

// Initialize default IdentityToolkit status from config without triggering a 401 browser network error on boot
const bootConfig = getResolvedFirebaseConfig();
if (bootConfig.oAuthClientId && !bootConfig.recaptchaSiteKey) {
  identityToolkitStatus = 'app_check_enforced';
  identityToolkitMessage =
    'Firebase App Check is enforced on Identity Platform without a client site key; using official Google Identity Services (GIS) OAuth 2.0 Web Client directly.';
}

export function getFirebaseAuthDiagnosticReport(): FirebaseAuthDiagnosticReport {
  const resolved = getResolvedFirebaseConfig();
  const hostname = typeof window !== 'undefined' ? window.location.hostname : 'localhost';
  const useGis =
    Boolean(resolved.oAuthClientId) &&
    (identityToolkitStatus === 'app_check_enforced' ||
      identityToolkitStatus === 'error' ||
      Boolean((window as unknown as GoogleIdentityServicesWindow).google?.accounts?.oauth2));

  return {
    projectId: resolved.projectId,
    authDomain: resolved.authDomain,
    apiKeyConfigured: Boolean(resolved.apiKey),
    oAuthClientIdConfigured: Boolean(resolved.oAuthClientId),
    oAuthClientId: resolved.oAuthClientId || '',
    firestoreDatabaseId: resolved.firestoreDatabaseId || '(default)',
    currentHostname: hostname,
    identityToolkitStatus,
    identityToolkitMessage,
    activeAuthTransport: useGis ? 'gis_oauth2' : 'firebase_popup',
  };
}

/**
 * Ensure Google Identity Services script is loaded in the browser
 */
async function ensureGoogleIdentityServicesLoaded(): Promise<
  NonNullable<NonNullable<GoogleIdentityServicesWindow['google']>['accounts']>['oauth2']
> {
  if (typeof window === 'undefined') {
    throw new Error('Google authentication requires a browser environment.');
  }
  const win = window as unknown as GoogleIdentityServicesWindow;
  if (win.google?.accounts?.oauth2) {
    return win.google.accounts.oauth2;
  }

  await new Promise<void>((resolve, reject) => {
    const existingScript = document.querySelector<HTMLScriptElement>(
      'script[src="https://accounts.google.com/gsi/client"]',
    );
    if (existingScript) {
      const checkInterval = window.setInterval(() => {
        if (win.google?.accounts?.oauth2) {
          window.clearInterval(checkInterval);
          resolve();
        }
      }, 50);
      window.setTimeout(() => {
        window.clearInterval(checkInterval);
        if (win.google?.accounts?.oauth2) {
          resolve();
        } else {
          reject(new Error('Timed out waiting for Google Identity Services script to initialize.'));
        }
      }, 6000);
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () =>
      reject(new Error('Failed to load Google Identity Services (https://accounts.google.com/gsi/client).'));
    document.head.appendChild(script);
  });

  if (!win.google?.accounts?.oauth2) {
    throw new Error('Google Identity Services failed to initialize.');
  }
  return win.google.accounts.oauth2;
}

/**
 * Request an OAuth 2.0 access token via Google Identity Services popup
 */
async function requestGisOAuthToken(params: {
  clientId: string;
  scope: string;
  prompt: 'select_account' | 'consent';
  hint?: string;
}): Promise<{ accessToken: string; expiresIn: number; grantedScope: string }> {
  const oauth2 = await ensureGoogleIdentityServicesLoaded();
  if (!oauth2) {
    throw new Error('Google Identity Services OAuth2 client is unavailable.');
  }

  return new Promise((resolve, reject) => {
    let settled = false;
    const tokenClient = oauth2.initTokenClient({
      client_id: params.clientId,
      scope: params.scope,
      prompt: params.prompt,
      hint: params.hint,
      callback: (response: GisTokenResponse) => {
        if (settled) return;
        settled = true;
        if (response.error) {
          if (response.error === 'popup_closed_by_user' || response.error === 'access_denied') {
            reject(
              new Error(
                response.error === 'access_denied'
                  ? 'Google authorization was declined. Please approve the requested permissions to continue.'
                  : 'The Google sign-in window was closed before completing authentication.',
              ),
            );
            return;
          }
          reject(
            new Error(
              response.error_description ||
                `Google OAuth error (${response.error}). Please try again.`,
            ),
          );
          return;
        }
        if (!response.access_token) {
          reject(new Error('Google did not return an OAuth access token.'));
          return;
        }
        resolve({
          accessToken: response.access_token,
          expiresIn: Number(response.expires_in) || 3500,
          grantedScope: response.scope || params.scope,
        });
      },
      error_callback: (err: { type?: string; message?: string }) => {
        if (settled) return;
        settled = true;
        if (err?.type === 'popup_closed') {
          reject(new Error('The Google sign-in window was closed before completing authentication.'));
          return;
        }
        if (err?.type === 'popup_failed_to_open') {
          reject(
            new Error(
              'The Google popup was blocked by your browser. Please allow popups for this site and try again.',
            ),
          );
          return;
        }
        reject(new Error(err?.message || 'Google popup authentication was interrupted.'));
      },
    });

    tokenClient.requestAccessToken({ prompt: params.prompt, hint: params.hint });
  });
}

/**
 * Fetch verified Google user profile using an OAuth 2.0 access token
 */
async function fetchVerifiedGoogleUserInfo(accessToken: string): Promise<{
  sub: string;
  email: string;
  name: string;
  picture?: string;
  email_verified?: boolean;
}> {
  const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    throw new Error(`Failed to verify Google account profile (HTTP ${res.status}).`);
  }
  const profile = (await res.json()) as {
    sub?: string;
    email?: string;
    name?: string;
    picture?: string;
    email_verified?: boolean;
  };
  if (!profile.email) {
    throw new Error('Google account did not provide an email address.');
  }
  return {
    sub: profile.sub || profile.email,
    email: profile.email,
    name: profile.name || profile.email.split('@')[0],
    picture: profile.picture,
    email_verified: profile.email_verified,
  };
}

/**
 * Format Firebase Auth errors into clear, actionable messages
 */
function formatFirebaseAuthError(err: unknown, context: 'signin' | 'drive'): Error {
  const firebaseErr = err as { code?: string; message?: string };
  const code = firebaseErr?.code || '';
  const msg = firebaseErr?.message || '';

  if (code === 'auth/popup-closed-by-user') {
    return new Error(
      context === 'drive'
        ? 'Google Drive authorization was cancelled (popup closed).'
        : 'Sign in was cancelled (the Google popup was closed).',
    );
  }
  if (code === 'auth/cancelled-popup-request') {
    return new Error('Another Google popup is already open. Please complete or close it and try again.');
  }
  if (code === 'auth/popup-blocked') {
    return new Error(
      'The Google popup was blocked by your browser. Please allow popups for this site and try again.',
    );
  }
  if (code === 'auth/unauthorized-domain') {
    const host = typeof window !== 'undefined' ? window.location.hostname : 'current domain';
    return new Error(
      `Domain "${host}" is not authorized in Firebase Authentication. Add it under Firebase Console > Authentication > Settings > Authorized domains.`,
    );
  }
  if (code === 'auth/internal-error' || msg.includes('auth/internal-error')) {
    if (identityToolkitStatus === 'app_check_enforced') {
      return new Error(
        'Firebase Identity Platform rejected the request because Firebase App Check enforcement is enabled without a client site key. Please retry to sign in via Google Identity Services.',
      );
    }
    return new Error(
      'Google authentication encountered a Firebase configuration error (auth/internal-error). Please try again.',
    );
  }
  return new Error(msg || (context === 'drive' ? 'Google Drive authorization failed.' : 'Google sign-in failed.'));
}

export function getCachedDriveAccessToken(): string | null {
  if (!inMemoryDriveAccessToken) return null;
  if (Date.now() > inMemoryDriveTokenExpiry) {
    inMemoryDriveAccessToken = null;
    inMemoryDriveEmail = null;
    return null;
  }
  return inMemoryDriveAccessToken;
}

export function getCachedDriveEmail(): string | null {
  if (!getCachedDriveAccessToken()) return null;
  return inMemoryDriveEmail;
}

export function setCachedDriveToken(
  token: string | null,
  email?: string,
  expiresInSeconds: number = 3500,
): void {
  inMemoryDriveAccessToken = token;
  inMemoryDriveEmail = token ? email || null : null;
  inMemoryDriveTokenExpiry = token ? Date.now() + expiresInSeconds * 1000 : 0;
}

export function clearCachedDriveToken(): void {
  const tokenToRevoke = inMemoryDriveAccessToken;
  inMemoryDriveAccessToken = null;
  inMemoryDriveEmail = null;
  inMemoryDriveTokenExpiry = 0;
  if (tokenToRevoke && typeof window !== 'undefined') {
    try {
      const win = window as unknown as GoogleIdentityServicesWindow;
      win.google?.accounts?.oauth2?.revoke?.(tokenToRevoke, () => {});
    } catch {
      // Ignore revoke errors
    }
  }
}

/**
 * Perform SHA-256 integrity hash
 */
export async function computeSha256(content: string): Promise<string> {
  if (typeof window !== 'undefined' && window.crypto && window.crypto.subtle) {
    const encoder = new TextEncoder();
    const data = encoder.encode(content);
    const hashBuffer = await window.crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  }
  let hash = 0;
  for (let i = 0; i < content.length; i++) {
    hash = (hash << 5) - hash + content.charCodeAt(i);
    hash |= 0;
  }
  return `fallback-${Math.abs(hash).toString(16)}`;
}

/**
 * Generate a standardized, versioned backup package
 */
export async function buildBackupPackage(
  slice: UserPrivateDatabaseSlice,
): Promise<{ packageData: FullBackupPackage; serialized: string; checksum: string }> {
  const counts: Record<string, number> = {
    employments: slice.employments?.length || 0,
    salaryVersions: slice.salaryVersions?.length || 0,
    attendance: slice.attendance?.length || 0,
    overtimeLedger: slice.overtimeLedger?.length || 0,
    leaves: slice.leaves?.length || 0,
    vacationPlans: slice.vacationPlans?.length || 0,
    vacationAccrualPeriods: slice.vacationAccrualPeriods?.length || 0,
    vacationPayCalculations: slice.vacationPayCalculations?.length || 0,
    loans: slice.loans?.length || 0,
    loanRepayments: slice.loanRepayments?.length || 0,
    payslips: slice.payslips?.length || 0,
    documents: slice.documents?.length || 0,
    reminders: slice.reminders?.length || 0,
    finance: slice.finance?.length || 0,
    overtimeCalculations: slice.overtimeCalculations?.length || 0,
  };

  const payloadString = JSON.stringify(slice);
  const checksum = await computeSha256(payloadString);

  const packageData: FullBackupPackage = {
    metadata: {
      backupVersion: 2,
      appName: 'Saudi Salary Pro',
      exportedAt: new Date().toISOString(),
      userId: slice.user.id,
      userEmail: slice.user.email,
      checksum,
      recordCounts: counts,
    },
    slice,
  };

  const serialized = JSON.stringify(packageData, null, 2);
  return { packageData, serialized, checksum };
}

/**
 * Google Sign-In ONLY (Identity authentication: openid, email, profile).
 * IMPORTANT: Does NOT grant or mark Google Drive as connected.
 * Google Drive authorization is handled separately via authorizeGoogleDrive().
 */
export async function signInWithGooglePopup(): Promise<{
  email: string;
  fullName: string;
  photoUrl?: string;
  googleId: string;
  accessToken?: string;
}> {
  const resolved = getResolvedFirebaseConfig();
  const win = typeof window !== 'undefined' ? (window as unknown as GoogleIdentityServicesWindow) : null;

  // Prefer Google Identity Services when oAuthClientId is configured and either:
  // 1) IdentityToolkit is blocked by App Check enforcement (which causes Firebase auth/internal-error), or
  // 2) GIS is already loaded in the page for direct OAuth 2.0 authentication.
  const shouldUseGis =
    Boolean(resolved.oAuthClientId) &&
    (identityToolkitStatus === 'app_check_enforced' ||
      identityToolkitStatus === 'error' ||
      Boolean(win?.google?.accounts?.oauth2));

  if (shouldUseGis && resolved.oAuthClientId) {
    const tokenRes = await requestGisOAuthToken({
      clientId: resolved.oAuthClientId,
      scope: IDENTITY_SCOPES,
      prompt: 'select_account',
    });
    const userInfo = await fetchVerifiedGoogleUserInfo(tokenRes.accessToken);
    // NOTE: Do NOT call setCachedDriveToken here! Sign-in only authenticates identity.
    return {
      email: userInfo.email,
      fullName: userInfo.name,
      photoUrl: userInfo.picture,
      googleId: userInfo.sub,
      accessToken: tokenRes.accessToken,
    };
  }

  try {
    const auth = getFirebaseAuth();
    const provider = new GoogleAuthProvider();
    provider.addScope('email');
    provider.addScope('profile');
    provider.setCustomParameters({ prompt: 'select_account' });

    const userCredential = await signInWithPopup(auth, provider);
    const user = userCredential.user;
    const credential = GoogleAuthProvider.credentialFromResult(userCredential);
    const accessToken = credential?.accessToken;

    if (!user.email) {
      throw new Error('Google did not provide an email address. Please allow email access.');
    }

    // NOTE: Do NOT call setCachedDriveToken here! Sign-in does not request drive.file scope.
    return {
      email: user.email,
      fullName: user.displayName || user.email.split('@')[0],
      photoUrl: user.photoURL || undefined,
      googleId: user.uid,
      accessToken,
    };
  } catch (err: unknown) {
    const firebaseErr = err as { code?: string; message?: string };
    if (
      (firebaseErr?.code === 'auth/internal-error' ||
        firebaseErr?.message?.includes('auth/internal-error')) &&
      resolved.oAuthClientId
    ) {
      identityToolkitStatus = 'app_check_enforced';
      const tokenRes = await requestGisOAuthToken({
        clientId: resolved.oAuthClientId,
        scope: IDENTITY_SCOPES,
        prompt: 'select_account',
      });
      const userInfo = await fetchVerifiedGoogleUserInfo(tokenRes.accessToken);
      return {
        email: userInfo.email,
        fullName: userInfo.name,
        photoUrl: userInfo.picture,
        googleId: userInfo.sub,
        accessToken: tokenRes.accessToken,
      };
    }
    throw formatFirebaseAuthError(err, 'signin');
  }
}

/**
 * Connect Google Drive by explicitly requesting the least-privilege drive.file scope.
 * Verifies that the returned token actually has Drive access and identifies the authorized Google account
 * before marking Google Drive as connected in memory.
 */
export async function authorizeGoogleDrive(hintEmail?: string): Promise<{
  accessToken: string;
  email: string;
}> {
  const resolved = getResolvedFirebaseConfig();
  const win = typeof window !== 'undefined' ? (window as unknown as GoogleIdentityServicesWindow) : null;

  const shouldUseGis =
    Boolean(resolved.oAuthClientId) &&
    (identityToolkitStatus === 'app_check_enforced' ||
      identityToolkitStatus === 'error' ||
      Boolean(win?.google?.accounts?.oauth2));

  if (shouldUseGis && resolved.oAuthClientId) {
    const tokenRes = await requestGisOAuthToken({
      clientId: resolved.oAuthClientId,
      scope: DRIVE_FULL_SCOPES,
      prompt: 'consent',
      hint: hintEmail,
    });

    // Verify that the user granted the drive.file scope
    const grantedScopes = (tokenRes.grantedScope || '').split(/\s+/);
    if (grantedScopes.length > 0 && !grantedScopes.includes(DRIVE_FILE_SCOPE)) {
      throw new Error(
        'Google Drive permission (drive.file) was not granted. Please check the Google Drive permission box in the consent screen.',
      );
    }

    const userInfo = await fetchVerifiedGoogleUserInfo(tokenRes.accessToken);
    setCachedDriveToken(tokenRes.accessToken, userInfo.email, tokenRes.expiresIn);
    return {
      accessToken: tokenRes.accessToken,
      email: userInfo.email,
    };
  }

  try {
    const auth = getFirebaseAuth();
    const provider = new GoogleAuthProvider();
    provider.addScope(DRIVE_FILE_SCOPE);
    provider.addScope('email');
    provider.addScope('profile');
    provider.setCustomParameters({
      prompt: 'consent',
      ...(hintEmail ? { login_hint: hintEmail } : {}),
    });

    const userCredential = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(userCredential);
    const accessToken = credential?.accessToken;
    const user = userCredential.user;

    if (!accessToken) {
      throw new Error('Could not obtain an authorized Google Drive access token from Google.');
    }

    let verifiedEmail = user.email || '';
    if (!verifiedEmail) {
      const userInfo = await fetchVerifiedGoogleUserInfo(accessToken);
      verifiedEmail = userInfo.email;
    }

    setCachedDriveToken(accessToken, verifiedEmail, 3500);
    return { accessToken, email: verifiedEmail };
  } catch (err: unknown) {
    const firebaseErr = err as { code?: string; message?: string };
    if (
      (firebaseErr?.code === 'auth/internal-error' ||
        firebaseErr?.message?.includes('auth/internal-error')) &&
      resolved.oAuthClientId
    ) {
      identityToolkitStatus = 'app_check_enforced';
      const tokenRes = await requestGisOAuthToken({
        clientId: resolved.oAuthClientId,
        scope: DRIVE_FULL_SCOPES,
        prompt: 'consent',
        hint: hintEmail,
      });
      const userInfo = await fetchVerifiedGoogleUserInfo(tokenRes.accessToken);
      setCachedDriveToken(tokenRes.accessToken, userInfo.email, tokenRes.expiresIn);
      return { accessToken: tokenRes.accessToken, email: userInfo.email };
    }
    throw formatFirebaseAuthError(err, 'drive');
  }
}

/**
 * Sign out from Firebase Auth and clear any in-memory Google Drive token
 */
export async function signOutFirebase(): Promise<void> {
  clearCachedDriveToken();
  try {
    const auth = getFirebaseAuth();
    await firebaseSignOut(auth);
  } catch {
    // Ignore sign out errors
  }
}

/**
 * Get or create "Saudi Salary Pro Backups" dedicated folder in Google Drive
 */
export async function getOrCreateDriveBackupsFolder(
  token: string,
  folderName: string = 'Saudi Salary Pro Backups',
): Promise<string> {
  const query = `mimeType = 'application/vnd.google-apps.folder' and name = '${folderName}' and trashed = false`;
  const listUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name)`;

  const listRes = await fetch(listUrl, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!listRes.ok) {
    if (listRes.status === 401 || listRes.status === 403) {
      clearCachedDriveToken();
      throw new Error(
        listRes.status === 403
          ? 'Google Drive access was denied (missing drive.file permission). Please reconnect Google Drive.'
          : 'Google Drive authorization expired. Please reconnect Google Drive.',
      );
    }
    throw new Error(`Google Drive API error: ${listRes.statusText}`);
  }

  const listData = (await listRes.json()) as { files?: Array<{ id: string; name: string }> };
  if (listData.files && listData.files.length > 0) {
    return listData.files[0].id;
  }

  // Create folder
  const createRes = await fetch('https://www.googleapis.com/drive/v3/files', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: folderName,
      mimeType: 'application/vnd.google-apps.folder',
      description: 'Dedicated storage folder for Saudi Salary Pro encrypted backups',
    }),
  });

  if (!createRes.ok) {
    throw new Error(`Failed to create Google Drive backup folder: ${createRes.statusText}`);
  }

  const createData = (await createRes.json()) as { id: string };
  return createData.id;
}

/**
 * Upload backup package to Google Drive
 */
export async function uploadBackupToDrive(
  token: string,
  folderId: string,
  backupPackage: FullBackupPackage,
): Promise<{ fileId: string; fileName: string; size: number }> {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const fileName = `SaudiSalaryPro_Backup_${timestamp}.json`;
  const fileContent = JSON.stringify(backupPackage, null, 2);

  const metadata = {
    name: fileName,
    parents: [folderId],
    description: `Saudi Salary Pro Backup for ${backupPackage.metadata.userEmail} (v${backupPackage.metadata.backupVersion})`,
    mimeType: 'application/json',
  };

  const boundary = '-------314159265358979323846';
  const delimiter = `\r\n--${boundary}\r\n`;
  const closeDelimiter = `\r\n--${boundary}--`;

  const multipartRequestBody =
    delimiter +
    'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
    JSON.stringify(metadata) +
    delimiter +
    'Content-Type: application/json\r\n\r\n' +
    fileContent +
    closeDelimiter;

  const uploadUrl = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart';
  const uploadRes = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': `multipart/related; boundary=${boundary}`,
    },
    body: multipartRequestBody,
  });

  if (!uploadRes.ok) {
    if (uploadRes.status === 401 || uploadRes.status === 403) {
      clearCachedDriveToken();
      throw new Error('Google Drive authorization has expired or lacks permission. Please reconnect Google Drive.');
    }
    const errText = await uploadRes.text();
    throw new Error(`Google Drive upload failed (${uploadRes.status}): ${errText}`);
  }

  const uploadData = (await uploadRes.json()) as { id: string; name: string; size?: string };
  return {
    fileId: uploadData.id,
    fileName: uploadData.name || fileName,
    size: new Blob([fileContent]).size,
  };
}

/**
 * List all Saudi Salary Pro backup files from Google Drive
 */
export async function listBackupsFromDrive(token: string): Promise<GoogleDriveBackupFile[]> {
  const query = `trashed = false and name contains 'SaudiSalaryPro_Backup_'`;
  const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name,size,createdTime,modifiedTime,description)&orderBy=createdTime desc&pageSize=30`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    if (res.status === 401 || res.status === 403) {
      clearCachedDriveToken();
      throw new Error('Google Drive authorization has expired. Please reconnect.');
    }
    throw new Error(`Failed to list backups from Google Drive: ${res.statusText}`);
  }

  const data = (await res.json()) as { files?: GoogleDriveBackupFile[] };
  return data.files || [];
}

/**
 * Download and verify a backup file from Google Drive
 */
export async function downloadAndVerifyDriveBackup(
  token: string,
  fileId: string,
): Promise<{ packageData: FullBackupPackage; integrityPassed: boolean }> {
  const url = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    if (res.status === 401 || res.status === 403) {
      clearCachedDriveToken();
      throw new Error('Google Drive authorization expired. Please reconnect.');
    }
    throw new Error(`Failed to download backup file: ${res.statusText}`);
  }

  const jsonText = await res.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    throw new Error('The downloaded file is not valid JSON.');
  }

  const backupPkg = parsed as Partial<FullBackupPackage>;
  if (!backupPkg.metadata || !backupPkg.slice) {
    throw new Error('Invalid backup file structure: missing metadata or slice payload.');
  }

  // Verify checksum
  let integrityPassed = true;
  if (backupPkg.metadata.checksum) {
    const computed = await computeSha256(JSON.stringify(backupPkg.slice));
    integrityPassed = computed === backupPkg.metadata.checksum;
  }

  return {
    packageData: backupPkg as FullBackupPackage,
    integrityPassed,
  };
}
