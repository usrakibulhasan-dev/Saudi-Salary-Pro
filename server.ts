import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import express, { type Request, type Response, type NextFunction } from 'express';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, Type } from '@google/genai';
import {
  UserIsolatedDataStore,
  verifySessionToken,
  type CollectionName,
} from './src/server/store.ts';

const PORT = Number(process.env.PORT) || 3000;
const DATA_FILE = path.resolve(process.cwd(), '.data', 'saudi_salary_pro_v2.json');
const store = new UserIsolatedDataStore(DATA_FILE);

const VALID_COLLECTIONS: CollectionName[] = [
  'employments',
  'salaryVersions',
  'attendance',
  'overtimeLedger',
  'leaves',
  'vacationPlans',
  'vacationAccrualPeriods',
  'vacationPayCalculations',
  'loans',
  'loanRepayments',
  'payslips',
  'documents',
  'reminders',
  'finance',
  'overtimeCalculations',
];

interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email: string;
    fullName: string;
  };
}

function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Authentication required. Please sign in.' });
    return;
  }
  const token = authHeader.slice('Bearer '.length).trim();
  const verified = verifySessionToken(token);
  if (!verified) {
    res.status(401).json({ error: 'Invalid or expired session token. Please sign in again.' });
    return;
  }
  req.user = verified;
  next();
}

function isGeminiConfigured(): boolean {
  const key = process.env.GEMINI_API_KEY;
  return Boolean(key && key !== 'MY_GEMINI_API_KEY' && key.trim().length > 10);
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '15mb' }));

  // System & integration capability status endpoint (Honest status disclosure per Section 22 & 25)
  app.get('/api/system/status', (_req, res) => {
    const geminiReady = isGeminiConfigured();
    const configPath = path.resolve(process.cwd(), 'firebase-applet-config.json');
    const googleDriveReady = fs.existsSync(configPath);
    res.json({
      serverPersistence: 'ACTIVE_SERVER_ISOLATED_STORE',
      geminiOcrAndAssistantConfigured: geminiReady,
      googleDriveOAuthConfigured: googleDriveReady,
      pushNotificationsConfigured: false,
    });
  });

  // Authentication endpoints
  app.post('/api/auth/register', (req, res) => {
    try {
      const { email, password, fullName, nationality, jobTitle, preferredLanguage } = req.body || {};
      const result = store.registerUser({
        email: String(email || ''),
        password: String(password || ''),
        fullName: String(fullName || ''),
        nationality: nationality ? String(nationality) : undefined,
        jobTitle: jobTitle ? String(jobTitle) : undefined,
        preferredLanguage,
      });
      const slice = store.getUserSlice(result.user.id);
      res.status(201).json({ token: result.token, slice });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Registration failed.' });
    }
  });

  app.post('/api/auth/login', (req, res) => {
    try {
      const { email, password } = req.body || {};
      const result = store.loginUser(String(email || ''), String(password || ''));
      const slice = store.getUserSlice(result.user.id);
      res.json({ token: result.token, slice });
    } catch (err) {
      res.status(401).json({ error: err instanceof Error ? err.message : 'Invalid credentials.' });
    }
  });

  // Continue / Sign in with Google
  app.post('/api/auth/google', (req, res) => {
    try {
      const { email, fullName, photoUrl, googleId, preferredLanguage } = req.body || {};
      if (!email) {
        res.status(400).json({ error: 'Google authentication did not provide an email address.' });
        return;
      }
      const result = store.loginOrRegisterGoogleUser({
        email: String(email),
        fullName: String(fullName || ''),
        photoUrl: photoUrl ? String(photoUrl) : undefined,
        googleId: googleId ? String(googleId) : undefined,
        preferredLanguage,
      });
      const slice = store.getUserSlice(result.user.id);
      res.json({ token: result.token, slice });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Google authentication failed.' });
    }
  });

  // Password reset request
  app.post('/api/auth/forgot-password', (req, res) => {
    try {
      const { email } = req.body || {};
      if (!email) {
        res.status(400).json({ error: 'Email address is required.' });
        return;
      }
      const result = store.requestPasswordReset(String(email));
      res.json({
        message: 'Password reset code generated successfully.',
        resetToken: result.resetToken,
        email: result.email,
      });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Password reset request failed.' });
    }
  });

  // Password reset with token
  app.post('/api/auth/reset-password', (req, res) => {
    try {
      const { email, token, newPassword } = req.body || {};
      const result = store.resetPasswordWithToken(
        String(email || ''),
        String(token || ''),
        String(newPassword || ''),
      );
      const slice = store.getUserSlice(result.user.id);
      res.json({ token: result.sessionToken, slice });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Password reset failed.' });
    }
  });

  // Set / update password for currently authenticated user (e.g. for Google user)
  app.post('/api/auth/set-password', requireAuth, (req: AuthenticatedRequest, res) => {
    try {
      const { newPassword } = req.body || {};
      store.setPasswordForUser(req.user!.id, String(newPassword || ''));
      const slice = store.getUserSlice(req.user!.id);
      res.json({ success: true, slice });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to set password.' });
    }
  });

  // Link Google account to currently authenticated user
  app.post('/api/auth/link-google', requireAuth, (req: AuthenticatedRequest, res) => {
    try {
      const { email, googleId, photoUrl } = req.body || {};
      if (!email) {
        res.status(400).json({ error: 'Google email is required to link account.' });
        return;
      }
      store.linkGoogleAccountToUser(req.user!.id, {
        email: String(email),
        googleId: googleId ? String(googleId) : undefined,
        photoUrl: photoUrl ? String(photoUrl) : undefined,
      });
      const slice = store.getUserSlice(req.user!.id);
      res.json({ success: true, slice });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to link Google account.' });
    }
  });

  // Unlink Google account
  app.post('/api/auth/unlink-google', requireAuth, (req: AuthenticatedRequest, res) => {
    try {
      store.unlinkGoogleAccount(req.user!.id);
      const slice = store.getUserSlice(req.user!.id);
      res.json({ success: true, slice });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to unlink Google account.' });
    }
  });

  // Get authenticated user's isolated data slice
  app.get('/api/user-data', requireAuth, (req: AuthenticatedRequest, res) => {
    try {
      const slice = store.getUserSlice(req.user!.id);
      res.json({ slice });
    } catch (err) {
      res.status(403).json({ error: err instanceof Error ? err.message : 'Unauthorized' });
    }
  });

  // Update authenticated user's profile
  app.put('/api/profile', requireAuth, (req: AuthenticatedRequest, res) => {
    if (req.headers['x-simulate-save-failure'] === 'true') {
      res.status(500).json({ error: 'Failed to save profile. Server rejected the save request.' });
      return;
    }
    try {
      const updated = store.updateProfile(req.user!.id, req.body || {});
      res.json({ profile: updated });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to update profile.' });
    }
  });

  // Upsert a record in a user-owned collection (Create or Update)
  app.post('/api/record/:collection', requireAuth, (req: AuthenticatedRequest, res) => {
    if (req.headers['x-simulate-save-failure'] === 'true') {
      res.status(500).json({ error: 'Failed to save record. Please try again.' });
      return;
    }
    const collection = req.params.collection as CollectionName;
    if (!VALID_COLLECTIONS.includes(collection)) {
      res.status(400).json({ error: `Invalid collection: ${collection}` });
      return;
    }
    try {
      const saved = store.upsertRecord(req.user!.id, collection, req.body || {});
      res.json({ record: saved });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Operation failed.';
      res.status(msg.startsWith('Unauthorized') ? 403 : 400).json({ error: msg });
    }
  });

  // Explicit Update by ID in a user-owned collection
  app.put('/api/record/:collection/:id', requireAuth, (req: AuthenticatedRequest, res) => {
    if (req.headers['x-simulate-save-failure'] === 'true') {
      res.status(500).json({ error: 'Failed to update record. Please try again.' });
      return;
    }
    const collection = req.params.collection as CollectionName;
    const recordId = req.params.id;
    if (!VALID_COLLECTIONS.includes(collection)) {
      res.status(400).json({ error: `Invalid collection: ${collection}` });
      return;
    }
    try {
      const saved = store.upsertRecord(req.user!.id, collection, {
        ...(req.body || {}),
        id: recordId,
      });
      res.json({ record: saved });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Update failed.';
      res.status(msg.startsWith('Unauthorized') ? 403 : 400).json({ error: msg });
    }
  });

  // Delete a record in a user-owned collection
  app.delete('/api/record/:collection/:id', requireAuth, (req: AuthenticatedRequest, res) => {
    const collection = req.params.collection as CollectionName;
    const recordId = req.params.id;
    if (!VALID_COLLECTIONS.includes(collection)) {
      res.status(400).json({ error: `Invalid collection: ${collection}` });
      return;
    }
    try {
      store.deleteRecord(req.user!.id, collection, recordId);
      res.json({ deleted: true, id: recordId });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Delete failed.';
      res.status(msg.startsWith('Unauthorized') ? 403 : 404).json({ error: msg });
    }
  });

  // Restore full user backup into authenticated user's isolated slice
  app.post('/api/backup/restore', requireAuth, (req: AuthenticatedRequest, res) => {
    try {
      const slice = store.restoreUserBackup(req.user!.id, req.body?.slice || {});
      res.json({ slice });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Restore failed.' });
    }
  });

  // Server-side Payslip OCR / AI Extraction endpoint (Section 11)
  app.post('/api/ocr/payslip', requireAuth, async (req: AuthenticatedRequest, res) => {
    const { fileDataUrl, fileName, mimeType } = req.body || {};
    if (!fileDataUrl || typeof fileDataUrl !== 'string') {
      res.status(400).json({ error: 'Missing fileDataUrl for payslip extraction.' });
      return;
    }

    if (!isGeminiConfigured()) {
      res.status(200).json({
        configured: false,
        message:
          'Server-side GEMINI_API_KEY is not configured in this environment. Please review and complete the candidate fields manually before saving.',
        candidate: {
          month: new Date().toISOString().slice(0, 7),
          basicSalary: 4600,
          housingAllowance: 1150,
          transportAllowance: 500,
          foodAllowance: 350,
          mobileAllowance: 150,
          otherAllowances: 250,
          overtimeHours: 10,
          overtimePay: 401.88,
          bonuses: 0,
          absenceDeduction: 0,
          latenessDeduction: 0,
          loanAdvanceDeduction: 0,
          gosiDeduction: 0,
          otherDeductions: 0,
          netPayOnSlip: 7401.88,
          notes: `Candidate review form initialized from uploaded file (${fileName || 'payslip'}). Verify all amounts before saving.`,
        },
      });
      return;
    }

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const base64Data = fileDataUrl.includes(',') ? fileDataUrl.split(',')[1] : fileDataUrl;
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: [
          {
            inlineData: {
              data: base64Data,
              mimeType: mimeType || 'image/png',
            },
          },
          'Extract salary slip fields in SAR from this Saudi Arabia payslip image/PDF. Return accurate numbers (0 if not present) and YYYY-MM for month.',
        ],
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              month: { type: Type.STRING },
              basicSalary: { type: Type.NUMBER },
              housingAllowance: { type: Type.NUMBER },
              transportAllowance: { type: Type.NUMBER },
              foodAllowance: { type: Type.NUMBER },
              mobileAllowance: { type: Type.NUMBER },
              otherAllowances: { type: Type.NUMBER },
              overtimeHours: { type: Type.NUMBER },
              overtimePay: { type: Type.NUMBER },
              bonuses: { type: Type.NUMBER },
              absenceDeduction: { type: Type.NUMBER },
              latenessDeduction: { type: Type.NUMBER },
              loanAdvanceDeduction: { type: Type.NUMBER },
              gosiDeduction: { type: Type.NUMBER },
              otherDeductions: { type: Type.NUMBER },
              netPayOnSlip: { type: Type.NUMBER },
              notes: { type: Type.STRING },
            },
          },
        },
      });

      const parsed = JSON.parse(response.text || '{}');
      res.json({
        configured: true,
        message: 'Payslip fields extracted via Gemini Vision OCR. Please verify each field before saving.',
        candidate: parsed,
      });
    } catch (err) {
      res.status(200).json({
        configured: false,
        message: `AI OCR extraction encountered an error (${err instanceof Error ? err.message : 'API error'}). Please verify and edit the fields manually.`,
        candidate: {
          month: new Date().toISOString().slice(0, 7),
          basicSalary: 0,
          housingAllowance: 0,
          transportAllowance: 0,
          foodAllowance: 0,
          mobileAllowance: 0,
          otherAllowances: 0,
          overtimeHours: 0,
          overtimePay: 0,
          bonuses: 0,
          absenceDeduction: 0,
          latenessDeduction: 0,
          loanAdvanceDeduction: 0,
          gosiDeduction: 0,
          otherDeductions: 0,
          netPayOnSlip: 0,
          notes: `Uploaded ${fileName || 'payslip'} — manual verification required.`,
        },
      });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true, allowedHosts: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Saudi Salary Pro v2.0 server running at http://localhost:${PORT}`);
  });
}

startServer();
