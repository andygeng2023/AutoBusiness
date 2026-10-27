import type { Company } from '../types';

export const INDUSTRIES = [
  'Software & technology',
  'Creative studio',
  'Research',
  'Marketing & content',
  'Consulting',
  'E-commerce',
  'Personal projects',
  'Other',
] as const;

export function validateCompanyName(value: string): string | null {
  const name = value.trim();
  if (name.length < 2) return 'Use at least 2 characters.';
  if (name.length > 80) return 'Keep the company name under 80 characters.';
  return null;
}

export function makeCompany(input: {
  name: string;
  industry: string;
  description: string;
  id?: string;
  now?: string;
}): Company {
  const name = input.name.trim();
  const error = validateCompanyName(name);
  if (error) throw new Error(error);
  const now = input.now ?? new Date().toISOString();
  return {
    id: input.id ?? crypto.randomUUID(),
    name,
    industry: input.industry,
    description: input.description.trim().slice(0, 500),
    createdAt: now,
    updatedAt: now,
  };
}