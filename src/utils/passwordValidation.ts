/**
 * Passwort-Validierung für sicheren Self-Service Flow
 * Mindestens 8 Zeichen, Groß/Kleinbuchstaben, Zahl, Sonderzeichen
 */

export interface PasswordValidation {
  isValid: boolean;
  errors: string[];
}

export const validatePassword = (password: string): PasswordValidation => {
  const errors: string[] = [];

  if (password.length < 8) {
    errors.push("Mindestens 8 Zeichen erforderlich");
  }

  if (!/[a-z]/.test(password)) {
    errors.push("Mindestens ein Kleinbuchstabe erforderlich");
  }

  if (!/[A-Z]/.test(password)) {
    errors.push("Mindestens ein Großbuchstabe erforderlich");
  }

  if (!/\d/.test(password)) {
    errors.push("Mindestens eine Zahl erforderlich");
  }

  if (!/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
    errors.push("Mindestens ein Sonderzeichen erforderlich");
  }

  return {
    isValid: errors.length === 0,
    errors
  };
};

export const validatePasswordMatch = (password: string, confirmPassword: string): boolean => {
  return password === confirmPassword;
};