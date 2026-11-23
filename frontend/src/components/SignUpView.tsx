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
import { signupRequestCode, signupVerifyCode, signupComplete } from '../api/auth';
import { Feedback } from './Feedback';
import { PasswordRules } from './PasswordRules';
import { evaluatePassword, isPasswordValid } from '../lib/password';

interface SignUpViewProps {
  onSignUpSuccess: () => void;
  onNavigateToLogin: () => void;
}

const STEP_TITLES = { 1: 'Your email', 2: 'Email code', 3: 'Set password' } as const;

export const SignUpView: React.FC<SignUpViewProps> = ({ onSignUpSuccess, onNavigateToLogin }) => {
  // Step 1: SZABIST email, Step 2: 6-digit code, Step 3: choose a password
  const [step, setStep] = useState<1 | 2 | 3>(1);

  const [email, setEmail] = useState('');
  const [maskedEmail, setMaskedEmail] = useState('');
  const [code, setCode] = useState('');
  const [signupToken, setSignupToken] = useState('');
  const [attemptsRemaining, setAttemptsRemaining] = useState<number | null>(5);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const interval = setInterval(() => setResendCooldown((prev) => Math.max(0, prev - 1)), 1000);
    return () => clearInterval(interval);
  }, [resendCooldown]);

  const criteria = evaluatePassword(password, confirmPassword);

  const handleRequestCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) {
      setErrorMessage('Please enter your SZABIST email.');
      return;
    }
    setLoading(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      const data = await signupRequestCode(email.trim());
      setMaskedEmail(data.emailMasked);
      setSuccessMessage(data.message || 'Verification code sent to your email.');
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
      setErrorMessage('Please enter the complete 6-digit verification code.');
      return;
    }
    setLoading(true);
    setErrorMessage(null);
    try {
      const data = await signupVerifyCode(email.trim(), code.trim());
      setSignupToken(data.signupToken);
      setSuccessMessage('Code verified. Please create your password.');
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
      await signupRequestCode(email.trim());
      setSuccessMessage('New verification code sent. Check your inbox.');
      setResendCooldown(60);
      setCode('');
      setAttemptsRemaining(5);
    } catch (err: unknown) {
      const error = err as { message?: string };
      setErrorMessage(error.message || 'Unable to resend code. Please try again later.');
    } finally {
      setLoading(false);
    }
  };

  const handleComplete = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isPasswordValid(criteria)) {
      setErrorMessage('Please satisfy all password rules before continuing.');
      return;
    }
    setLoading(true);
    setErrorMessage(null);
    try {
      await signupComplete(signupToken, password, confirmPassword);
      setSuccessMessage('Account created. Taking you to sign in...');
      setTimeout(onSignUpSuccess, 1500);
    } catch (err: unknown) {
      const error = err as { message?: string };
      setErrorMessage(error.message || 'Unable to create account. Please try again later.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Page>
      <Navbar
        title="Create account"
        left={<NavbarBackLink text="Sign in" onClick={onNavigateToLogin} />}
      />

      <BlockTitle>
        Step {step} of 3 &middot; {STEP_TITLES[step]}
      </BlockTitle>
      <Feedback error={errorMessage} info={successMessage} />

      {step === 1 && (
        <form onSubmit={handleRequestCode} noValidate>
          <Block className="!mb-2 text-sm text-slate-600">
            Use your SZABIST email (ending in szabist.pk or szabist.edu.pk). We will email you a 6-digit code.
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
            Enter the code we sent to <strong>{maskedEmail}</strong>. It expires in 10 minutes.
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
            <Button
              clear
              type="button"
              onClick={() => {
                setStep(1);
                setErrorMessage(null);
                setSuccessMessage(null);
              }}
            >
              Change email
            </Button>
          </Block>
        </form>
      )}

      {step === 3 && (
        <form onSubmit={handleComplete} noValidate>
          <List strong inset>
            <ListInput
            outline
              label="Password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="new-password"
              placeholder="Create a password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <ListInput
            outline
              label="Confirm password"
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
              {loading ? 'Creating account...' : 'Create account'}
            </Button>
          </Block>
        </form>
      )}
    </Page>
  );
};
