import { describe, expect, it } from 'vitest';
import { can } from './permissions';

describe('can', () => {
  it('lets viewers only read', () => {
    expect(can('viewer', 'edit')).toBe(false);
    expect(can('viewer', 'manageBoard')).toBe(false);
    expect(can('viewer', 'manageProject')).toBe(false);
  });

  it('lets members change content but not the board or the project', () => {
    expect(can('member', 'edit')).toBe(true);
    expect(can('member', 'manageBoard')).toBe(false);
    expect(can('member', 'manageProject')).toBe(false);
  });

  it('lets owners do everything', () => {
    expect(can('owner', 'edit')).toBe(true);
    expect(can('owner', 'manageBoard')).toBe(true);
    expect(can('owner', 'manageProject')).toBe(true);
  });

  it('allows nothing without a role', () => {
    expect(can(undefined, 'edit')).toBe(false);
  });
});
