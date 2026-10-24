import type { Role } from './index';

export interface RegistrationInput {
  name: string;
  email: string;
  role: Role;
  phone: string;
  address: string;
  businessName: string;
}

export function normalizeRegistration(input: RegistrationInput): RegistrationInput {
  if (!['Customer', 'Dealer'].includes(input.role)) throw new Error('Choose a customer or dealer account.');
  const normalized = {
    role: input.role, name: input.name.trim(), email: input.email.trim().toLowerCase(),
    phone: input.phone.trim(), address: input.address.trim(),
    businessName: input.role === 'Dealer' ? input.businessName.trim() : '',
  };
  if (normalized.name.length < 2 || normalized.name.length > 100) throw new Error('Enter your name (2–100 characters).');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized.email) || normalized.email.length > 320) throw new Error('Enter a valid email address.');
  if (normalized.phone && !/^[6-9]\d{9}$/.test(normalized.phone)) throw new Error('Enter a valid 10-digit Indian mobile number.');
  if (normalized.address.length > 500) throw new Error('Keep your address within 500 characters.');
  if (normalized.businessName.length > 160) throw new Error('Keep your business name within 160 characters.');
  if (normalized.role === 'Dealer') {
    if (normalized.businessName.length < 2) throw new Error('Enter your business name.');
    if (!normalized.phone) throw new Error('A mobile number is required for dealer applications.');
    if (normalized.address.length < 12) throw new Error('Enter your full business address (at least 12 characters).');
  }
  return normalized;
}

export function validateNewPassword(password: string, confirmation: string) {
  if (password.length < 8) throw new Error('Use a password with at least 8 characters.');
  if (password.length > 128) throw new Error('Keep your password within 128 characters.');
  if (password !== confirmation) throw new Error('The passwords do not match.');
}
