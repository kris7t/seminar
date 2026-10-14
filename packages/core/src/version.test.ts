import { describe, expect, it } from 'vitest';

import { VERSION } from './version.ts';

describe('VERSION', () => {
  it('is a semantic version string', () => {
    expect(VERSION).toMatch(/^\d+\.\d+\.\d+/);
  });
});
