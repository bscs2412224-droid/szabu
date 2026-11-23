import React, { useState } from 'react';
import { Page, List, ListInput, ListItem, Toggle, Button, Block, BlockTitle, Chip } from 'konsta/react';
import { Download, GraduationCap, Briefcase, UserX, ShieldAlert } from 'lucide-react';
import type { User } from '../api/auth';
import { login } from '../api/auth';
import { useInstallPrompt } from '../lib/useInstallPrompt';
import { rememberEmail, rememberedEmail, saveSession } from '../lib/session';
import { BrandHeader } from './BrandHeader';
import { Feedback } from './Feedback';
import { PasswordField } from './PasswordField';

interface LoginViewProps {
  onLoginSuccess: (user: User) => void;
  onNavigateToSignUp: () => void;
  onNavigateToForgotPassword: () => void;
  /** Shown above the form, for example "You were logged out after 30 minutes of inactivity." */
  notice?: string | null;
}

// Quick test personas: tap one to fill in the email and password (for evaluation and testing)
const QUICK_PERSONAS = [
  { name: 'Zain', detail: 'Student', status: 'Active', email: 'bcsbs2212138@szabist.pk', password: 'Password123!', icon: GraduationCap },
  { name: 'Dr. Faraz Junejo', detail: 'Dean (Faculty)', status: 'Active', email: 'faraz.junejo@szabist.edu.pk', password: 'Password123!', icon: Briefcase },
  { name: 'Farzeen', detail: 'Student', status: 'Unassigned (REQ-2.5)', email: 'bscs2312246@szabist.pk', password: 'Password123!', icon: UserX },
  { name: 'Tariq Mehmood', detail: 'Faculty', status: 'Suspended (REQ-2.6)', email: 'tariq.m@szabist.edu.pk', password: 'Password123!', icon: ShieldAlert },
];

export const LoginView: React.FC<LoginViewProps> = ({
  onLoginSuccess,
  onNavigateToSignUp,
  onNavigateToForgotPassword,
  notice,
}) => {
  const [email, setEmail] = useState(rememberedEmail);
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(() => !!rememberedEmail());
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const { canInstall, install, showIosHint } = useInstallPrompt();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) {
      setErrorMessage('Please enter both your SZABIST email and password.');
      return;
    }

    setLoading(true);
    setErrorMessage(null);

    try {
      const data = await login(email.trim(), password);
      saveSession(data.token);
      rememberEmail(rememberMe ? email.trim() : null);
      onLoginSuccess(data.user);
    } catch (err: unknown) {
      const authErr = err as { locked?: boolean; remainingMinutes?: number; message?: string };
      if (authErr.locked) {
        setErrorMessage(
          `Account locked after too many failed attempts. Try again in ${authErr.remainingMinutes || 15} minutes.`,
        );
      } else {
        setErrorMessage(authErr.message || 'Unable to log in. Please try again later.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <Page>
      <BrandHeader />

      <form onSubmit={handleSubmit} noValidate>
        <Feedback error={errorMessage} notice={errorMessage ? null : notice} />

        <List strong inset className="!mt-4">
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
          <PasswordField
            label="Password"
            autoComplete="current-password"
            placeholder="Your password"
            value={password}
            onChange={setPassword}
          />
          <ListItem
            label
            title="Remember my email"
            after={<Toggle checked={rememberMe} onChange={() => setRememberMe((v) => !v)} />}
          />
        </List>

        <Block className="space-y-3">
          <Button large rounded type="submit" disabled={loading}>
            {loading ? 'Signing in...' : 'Sign in'}
          </Button>
          <Button large rounded tonal type="button" onClick={onNavigateToSignUp}>
            Create account
          </Button>
          <Button clear type="button" onClick={onNavigateToForgotPassword}>
            Forgot password?
          </Button>
        </Block>
      </form>

      <BlockTitle>Quick test personas (tap to fill)</BlockTitle>
      <List strong inset dividers>
        {QUICK_PERSONAS.map((p) => (
          <ListItem
            key={p.email}
            link
            chevronMaterial={false}
            onClick={() => {
              setEmail(p.email);
              setPassword(p.password);
              setErrorMessage(null);
            }}
            media={<p.icon className="w-6 h-6 text-primary" />}
            title={p.name}
            subtitle={p.email}
            after={<Chip>{p.status === 'Active' ? p.detail : p.status}</Chip>}
          />
        ))}
      </List>

      {showIosHint && (
        <Block className="text-xs text-slate-600">
          Install SzabU on your iPhone: tap the <strong>Share</strong> button in Safari, then <strong>Add to Home Screen</strong>.
          This also turns on phone notifications.
        </Block>
      )}

      {canInstall && (
        <Block>
          <Button outline rounded type="button" onClick={install}>
            <Download className="w-4 h-4 mr-2" />
            Install SzabU on this device
          </Button>
        </Block>
      )}

      <Block className="text-center text-xs text-slate-500">
        Need help? Contact{' '}
        <a href="mailto:admin@szabist.edu.pk" className="text-primary font-medium">
          admin@szabist.edu.pk
        </a>
      </Block>
    </Page>
  );
};
