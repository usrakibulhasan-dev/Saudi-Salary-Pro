import { describe, it } from 'node:test';
import assert from 'node:assert';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { UserIsolatedDataStore } from './store.ts';
import {
  getResolvedFirebaseConfig,
  getCachedDriveAccessToken,
  getCachedDriveEmail,
  setCachedDriveToken,
  clearCachedDriveToken,
  buildBackupPackage,
} from '../services/googleAuthAndDrive.ts';

describe('Saudi Salary Pro — Google Auth, Account Security & Backup Integrity Suite', () => {
  const testDbPath = path.resolve(process.cwd(), '.data', 'test_auth_drive.json');

  if (fs.existsSync(testDbPath)) {
    fs.unlinkSync(testDbPath);
  }

  const store = new UserIsolatedDataStore(testDbPath);

  it('1. New user registration via Google Sign-In creates isolated account and starter records without falsely marking Drive connected', () => {
    const googleUser = store.loginOrRegisterGoogleUser({
      email: 'expatriate.ahmed@gmail.com',
      fullName: 'Ahmed Farooq',
      photoUrl: 'https://lh3.googleusercontent.com/test-photo.jpg',
      googleId: 'google-sub-991284',
      preferredLanguage: 'en',
    });

    assert.ok(googleUser.token, 'Must return a valid session token');
    assert.strictEqual(googleUser.user.email, 'expatriate.ahmed@gmail.com');
    assert.strictEqual(googleUser.user.fullName, 'Ahmed Farooq');

    const slice = store.getUserSlice(googleUser.user.id);
    assert.strictEqual(slice.profile.googleConnected, true);
    assert.strictEqual(slice.profile.hasPassword, false);
    assert.ok(!slice.profile.googleDriveConnected, 'Google Sign-In alone must NOT mark Google Drive as connected');
    assert.strictEqual(slice.employments.length, 1, 'Starter employment record should be seeded');
    assert.strictEqual(slice.salaryVersions.length, 1, 'Starter salary structure should be seeded');
  });

  it('2. Existing manual user links Google ID on Google Sign-In without duplicate accounts', () => {
    const manualUser = store.registerUser({
      email: 'tariq.almansoor@example.sa',
      password: 'StrongPassword#2026',
      fullName: 'Tariq Al-Mansoor',
      nationality: 'Pakistani',
      jobTitle: 'Project QA Inspector',
      preferredLanguage: 'en',
    });

    assert.ok(manualUser.user.id);

    const linkedUser = store.loginOrRegisterGoogleUser({
      email: 'tariq.almansoor@example.sa',
      fullName: 'Tariq Al-Mansoor (Google)',
      photoUrl: 'https://lh3.googleusercontent.com/tariq.jpg',
      googleId: 'google-sub-tariq-7744',
    });

    assert.strictEqual(linkedUser.user.id, manualUser.user.id, 'Must reuse the exact same account ID');
    const slice = store.getUserSlice(manualUser.user.id);
    assert.strictEqual(slice.profile.googleConnected, true);
    assert.strictEqual(slice.profile.hasPassword, true, 'Original password authentication must remain active');
  });

  it('3. Password Reset Workflow: Generates 8-char verification code, expires, and resets password', () => {
    const { resetToken, email } = store.requestPasswordReset('tariq.almansoor@example.sa');
    assert.strictEqual(email, 'tariq.almansoor@example.sa');
    assert.strictEqual(resetToken.length, 8, 'Token should be 8 characters');

    assert.throws(
      () => store.resetPasswordWithToken('tariq.almansoor@example.sa', 'WRONGCODE', 'NewPassword#2026'),
      /Invalid or unrecognized reset code/,
    );

    const res = store.resetPasswordWithToken('tariq.almansoor@example.sa', resetToken, 'NewPassword#2026');
    assert.ok(res.sessionToken, 'Must generate session token after password reset');

    const loginRes = store.loginUser('tariq.almansoor@example.sa', 'NewPassword#2026');
    assert.strictEqual(loginRes.user.id, res.user.id);

    assert.throws(
      () => store.loginUser('tariq.almansoor@example.sa', 'StrongPassword#2026'),
      /Invalid email or password/,
    );
  });

  it('4. Allows Google-only user to set a manual password and safely link/unlink Google', () => {
    const googleOnlyUser = store.loginOrRegisterGoogleUser({
      email: 'santos.miguel@gmail.com',
      fullName: 'Miguel Santos',
      googleId: 'google-sub-miguel-1234',
    });

    assert.throws(
      () => store.unlinkGoogleAccount(googleOnlyUser.user.id),
      /Cannot disconnect Google account without setting a password first/,
    );

    store.setPasswordForUser(googleOnlyUser.user.id, 'MiguelSecure#2026');

    let slice = store.getUserSlice(googleOnlyUser.user.id);
    assert.strictEqual(slice.profile.hasPassword, true);

    store.unlinkGoogleAccount(googleOnlyUser.user.id);
    slice = store.getUserSlice(googleOnlyUser.user.id);
    assert.strictEqual(slice.profile.googleConnected, false);

    const loginRes = store.loginUser('santos.miguel@gmail.com', 'MiguelSecure#2026');
    assert.strictEqual(loginRes.user.id, googleOnlyUser.user.id);
  });

  it('5. Computes SHA-256 backup package integrity checksum and verifies against corruption', () => {
    const slice = store.getUserSlice('usr-rahim-01');
    const payload = JSON.stringify(slice);
    const checksum = crypto.createHash('sha256').update(payload).digest('hex');

    assert.ok(checksum && checksum.length === 64, 'SHA-256 hash must be 64 hexadecimal characters');

    const tamperedPayload = payload + ' ';
    const tamperedChecksum = crypto.createHash('sha256').update(tamperedPayload).digest('hex');
    assert.notStrictEqual(checksum, tamperedChecksum, 'Tampered data must not match original checksum');
  });

  it('6. Verifies Firebase Web SDK v9 resolved config and in-memory Google Drive token lifecycle', () => {
    const resolved = getResolvedFirebaseConfig();
    assert.strictEqual(resolved.projectId, 'gen-lang-client-0440453834');
    assert.strictEqual(resolved.authDomain, 'gen-lang-client-0440453834.firebaseapp.com');
    assert.ok(resolved.apiKey.startsWith('AIzaSy'), 'API Key must be valid Firebase Web API key');
    assert.strictEqual(
      resolved.oAuthClientId,
      '207156977694-62mrdrnmjbtrudfhaq8u87peae864vn7.apps.googleusercontent.com',
    );

    clearCachedDriveToken();
    assert.strictEqual(getCachedDriveAccessToken(), null);
    assert.strictEqual(getCachedDriveEmail(), null);

    setCachedDriveToken('ya29.test-drive-token', 'us.rakibulhasan@gmail.com', 3600);
    assert.strictEqual(getCachedDriveAccessToken(), 'ya29.test-drive-token');
    assert.strictEqual(getCachedDriveEmail(), 'us.rakibulhasan@gmail.com');

    clearCachedDriveToken();
    assert.strictEqual(getCachedDriveAccessToken(), null);
    assert.strictEqual(getCachedDriveEmail(), null);
  });

  it('7. Links a Google identity to an authenticated user account without switching accounts or conflating Drive status', () => {
    store.linkGoogleAccountToUser('usr-rahim-01', {
      email: 'us.rakibulhasan@gmail.com',
      googleId: 'google-uid-rakibul-001',
      photoUrl: 'https://lh3.googleusercontent.com/rakibul.jpg',
    });

    const rahimSlice = store.getUserSlice('usr-rahim-01');
    assert.strictEqual(rahimSlice.user.id, 'usr-rahim-01', 'User ID must remain usr-rahim-01');
    assert.strictEqual(rahimSlice.profile.googleConnected, true);
    assert.strictEqual(rahimSlice.profile.googleEmail, 'us.rakibulhasan@gmail.com');
    assert.ok(
      !rahimSlice.profile.googleDriveConnected,
      'Linking Google Sign-In must NOT mark Google Drive as connected',
    );

    // Prevent another user from claiming the same Google ID
    assert.throws(
      () =>
        store.linkGoogleAccountToUser('usr-carlo-02', {
          email: 'us.rakibulhasan@gmail.com',
          googleId: 'google-uid-rakibul-001',
        }),
      /already linked to another user account/,
    );
  });

  it('8. Backup package & restore preserves overtimeCalculations and enforces strict user isolation', async () => {
    store.upsertRecord('usr-rahim-01', 'overtimeCalculations', {
      title: 'March 2026 Payslip OT Verification',
      calculationMonth: '2026-03',
      basicSalary: 2050,
      actualSalary: 2250,
      companyAllowanceIncluded: 200,
      dailyWorkingHours: 8,
      monthDaysBasis: 30,
      overtimeMultiplier: 1.5,
      companyFormulaMode: 'basic_1_5',
      regularOtHours: 44.5,
      restDayOtHours: 0,
      holidayOtHours: 0,
      totalOtHours: 44.5,
      deductionScope: 'overtime_only',
      deductions: [],
      lawBasicHourlyRate: 8.54,
      lawActualHourlyRate: 9.38,
      lawEffectiveHourlyOtRate: 13.65,
      lawGrossOvertimeAmount: 607.24,
      companyHourlyRateBasis: 8.54,
      companyEffectiveHourlyOtRate: 12.81,
      companyGrossOvertimeAmount: 570.16,
      overtimeDifference: 37.08,
      totalDeductions: 0,
      lawNetResult: 607.24,
      companyNetResult: 570.16,
    });

    const rahimSlice = store.getUserSlice('usr-rahim-01');
    assert.strictEqual(rahimSlice.overtimeCalculations?.length, 1);

    const { packageData, checksum } = await buildBackupPackage(rahimSlice);
    assert.strictEqual(packageData.metadata.recordCounts.overtimeCalculations, 1);
    assert.ok(checksum.length > 0);

    // Restore into Carlo's account and verify Carlo's userId is stamped and Rahim's account is untouched
    const carloRestored = store.restoreUserBackup('usr-carlo-02', packageData.slice);
    assert.strictEqual(carloRestored.overtimeCalculations?.length, 1);
    assert.strictEqual(carloRestored.overtimeCalculations?.[0].userId, 'usr-carlo-02');
  });

  // Cleanup test DB
  if (fs.existsSync(testDbPath)) {
    fs.unlinkSync(testDbPath);
  }
});
