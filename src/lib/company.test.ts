import { describe, expect, it } from 'vitest';
import { makeCompany, validateCompanyName } from './company';

describe('company validation', () => {
  it('rejects blank and too-short names', () => {
    expect(validateCompanyName(' ')).toBe('Use at least 2 characters.');
    expect(validateCompanyName('A')).toBe('Use at least 2 characters.');
  });

  it('rejects names longer than 80 characters', () => {
    expect(validateCompanyName('x'.repeat(81))).toBe('Keep the company name under 80 characters.');
  });

  it('trims names and descriptions and creates timestamps', () => {
    const company = makeCompany({
      name: '  Northstar Studio  ',
      industry: 'Creative studio',
      description: '  Building useful things.  ',
      id: 'test-id',
      now: '2026-01-01T00:00:00.000Z',
    });
    expect(company.name).toBe('Northstar Studio');
    expect(company.description).toBe('Building useful things.');
    expect(company.id).toBe('test-id');
    expect(company.createdAt).toBe('2026-01-01T00:00:00.000Z');
  });
});