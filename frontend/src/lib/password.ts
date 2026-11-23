export interface PasswordCriteria {
  hasMinLength: boolean;
  hasUpper: boolean;
  hasLower: boolean;
  hasDigit: boolean;
  hasSpecial: boolean;
  passwordsMatch: boolean;
}

export function evaluatePassword(password: string, confirm: string): PasswordCriteria {
  return {
    hasMinLength: password.length >= 8,
    hasUpper: /[A-Z]/.test(password),
    hasLower: /[a-z]/.test(password),
    hasDigit: /[0-9]/.test(password),
    hasSpecial: /[^A-Za-z0-9]/.test(password),
    passwordsMatch: password.length > 0 && password === confirm,
  };
}

export function isPasswordValid(c: PasswordCriteria): boolean {
  return Object.values(c).every(Boolean);
}
