import React, { useState, useEffect } from 'react';
import {
  Page,
  Navbar,
  NavbarBackLink,
  List,
  ListInput,
  ListItem,
  Toggle,
  Button,
  Block,
  BlockTitle,
} from 'konsta/react';
import type { User } from '../api/auth';
import { forgotPasswordRequestCode, forgotPasswordVerifyCode, forgotPasswordReset } from '../api/auth';
import { Feedback } from './Feedback';
import { saveSession } from '../lib/session';
import { PasswordRules } from './PasswordRules';
import { evaluatePassword, isPasswordValid } from '../lib/password';

interface ForgotPasswordViewProps {
  onResetSuccess: (user: User) => void;
  onNavigateToLogin: () => void;
}

const STEP_TITLES = { 1: 'Your email', 2: 'Email code', 3: 'New password' } as const;

export const ForgotPasswordView: React.FC<ForgotPasswordViewProps> = ({
  onResetSuccess,
  onNavigateToLogin,
}) => {
  const [step, setStep] = useState<1 | 2 | 3>(1);

  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const [attemptsRemaining, setAttemptsRemaining] = useState<number | null>(5);
  const [resendCooldown, setResendCooldown] = useState(0);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const interval = setInterval(() => setResendCooldown((prev) => Math.max(0, prev - 1)), 1000);
    return () => clearInterval(interval);
  }, [resendCooldown]);

  const criteria = evaluatePassword(newPassword, confirmPassword);

  // The same message is shown whether or not the email is registered (REQ-3.2)
  const handleRequestCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) {
      setErrorMessage('Please enter your SZABIST email.');
      return;
    }
    setLoading(true);
    setErrorMessage(null);
    setInfoMessage(null);
    try {
      const data = await forgotPasswordRequestCode(email.trim());
      setInfoMessage(data.message);
      setResendCooldown(60);
      setStep(2);
    } catch (err: unknown) {
      const error = err as { message?: string };
      setErrorMessage(error.message || 'Unable to continue. Please try again later.');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (code.trim().length !== 6) {
      setErrorMessage('Please enter the 6-digit verification code.');
      return;
    }
    setLoading(true);
    setErrorMessage(null);
    try {
      const data = await forgotPasswordVerifyCode(email.trim(), code.trim());
      setResetToken(data.resetToken);
      setInfoMessage('Code verified. Set a new password to regain access.');
      setStep(3);
    } catch (err: unknown) {
      const error = err as { message?: string; remainingAttempts?: number };
      if (error.remainingAttempts !== undefined) setAttemptsRemaining(error.remainingAttempts);
      setErrorMessage(error.message || 'Invalid or expired code');
    } finally {
      setLoading(false);
    }
  };

  const handleResendCode = async () => {
    if (resendCooldown > 0) return;
    setLoading(true);
    setErrorMessage(null);
    try {
      const data = await forgotPasswordRequestCode(email.trim());
      setInfoMessage(data.message);
      setResendCooldown(60);
      setCode('');
      setAttemptsRemaining(5);
    } catch (err: unknown) {
      const error = err as { message?: string };
      setErrorMessage(error.message || 'Unable to request a new code. Please try again later.');
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isPasswordValid(criteria)) {
      setErrorMessage('Please satisfy all password rules before continuing.');
      return;
    }
    setLoading(true);
    setErrorMessage(null);
    try {
      const data = await forgotPasswordReset(resetToken, newPassword, confirmPassword);
      saveSession(data.token);
      setInfoMessage('Password changed. A confirmation notice was emailed to you.');
      setTimeout(() => onResetSuccess(data.user), 1200);
    } catch (err: unknown) {
      const error = err as { message?: string };
      setErrorMessage(error.message || 'Unable to update password. Please try again later.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Page>
      <Navbar
        title="Reset password"
        left={<NavbarBackLink text="Sign in" onClick={onNavigateToLogin} />}
      />

      <BlockTitle>
        Step {step} of 3 &middot; {STEP_TITLES[step]}
      </BlockTitle>
      <Feedback error={errorMessage} info={infoMessage} />

      {step === 1 && (
        <form onSubmit={handleRequestCode} noValidate>
          <Block className="!mb-2 text-sm text-slate-600">
            Enter your SZABIST email. If it is registered, we will email you a 6-digit code.
          </Block>
          <List strong inset>
            <ListInput
            outline
              label="SZABIST email"
              type="email"
              inputMode="email"
              autoComplete="username"
              placeholder="yourname@szabist.pk"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </List>
          <Block>
            <Button large rounded type="submit" disabled={loading}>
              {loading ? 'Sending...' : 'Send 6-digit code'}
            </Button>
          </Block>
        </form>
      )}

      {step === 2 && (
        <form onSubmit={handleVerifyCode} noValidate>
          <Block className="!mb-2 text-sm text-slate-600">
            Enter the 6-digit code from your email. It expires in 10 minutes.
          </Block>
          <List strong inset>
            <ListInput
            outline
              label="6-digit code"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              placeholder="000000"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              info={
                attemptsRemaining !== null && attemptsRemaining < 5
                  ? `${attemptsRemaining} attempts left`
                  : undefined
              }
            />
          </List>
          <Block className="space-y-3">
            <Button large rounded type="submit" disabled={loading}>
              {loading ? 'Verifying...' : 'Verify code'}
            </Button>
            <Button clear type="button" disabled={resendCooldown > 0 || loading} onClick={handleResendCode}>
              {resendCooldown > 0 ? `Resend code in ${resendCooldown}s` : 'Resend code'}
            </Button>
          </Block>
        </form>
      )}

      {step === 3 && (
        <form onSubmit={handleResetPassword} noValidate>
          <List strong inset>
            <ListInput
            outline
              label="New password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="new-password"
              placeholder="Create a new password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
            />
            <ListInput
            outline
              label="Confirm new password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="new-password"
              placeholder="Type it again"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
            />
            <ListItem
              label
              title="Show passwords"
              after={<Toggle checked={showPassword} onChange={() => setShowPassword((v) => !v)} />}
            />
          </List>
          <PasswordRules criteria={criteria} />
          <Block>
            <Button large rounded type="submit" disabled={loading || !isPasswordValid(criteria)}>
              {loading ? 'Saving...' : 'Save new password'}
            </Button>
          </Block>
        </form>
      )}
    </Page>
  );
};
