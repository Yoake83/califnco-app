import { validateAddress } from './index';
export const serviceTypes = ['Repair', 'Installation', 'Filter change', 'Maintenance'] as const;
export interface ServiceDraft { type: string; date: string; address: string; phone: string; notes: string; }
export function validateService(input: ServiceDraft, now = new Date()) {
  const clean = { type: input.type, date: input.date.trim(), address: input.address.trim(), phone: input.phone.trim(), notes: input.notes.trim() };
  if (!(serviceTypes as readonly string[]).includes(clean.type)) throw new Error('Choose a service type.');
  validateAddress(clean.address, clean.phone);
  if (clean.address.length > 500 || clean.notes.length > 1000) throw new Error('Use at most 500 characters for the address and 1000 for notes.');
  const visitAt = new Date(`${clean.date}T12:00:00.000Z`);
  const today = new Date(now.getTime() + 330 * 60000).toISOString().slice(0, 10);
  const maximum = new Date(new Date(today + 'T00:00:00Z').getTime() + 365 * 86400000).toISOString().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(clean.date) || Number.isNaN(visitAt.getTime()) || visitAt.toISOString().slice(0, 10) !== clean.date || clean.date < today || clean.date > maximum) throw new Error('Choose a valid date from today through the next 365 days.');
  return { ...clean, visitAt };
}
