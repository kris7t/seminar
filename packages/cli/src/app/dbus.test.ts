import { describe, expect, it } from 'vitest';

import { socketPath } from './dbus.ts';

describe('socketPath', () => {
  it('finds the Unix socket of a bus', () => {
    expect(socketPath('unix:path=/run/user/1000/bus')).toBe(
      '/run/user/1000/bus',
    );
    expect(
      socketPath('unix:abstract=/tmp/dbus-abc,guid=123;unix:path=/tmp/x'),
    ).toBe('\0/tmp/dbus-abc');
    expect(socketPath('tcp:host=localhost,port=1;unix:path=/a%20b')).toBe(
      '/a b',
    );
    expect(socketPath('unixexec:path=/bin/sh')).toBeUndefined();
  });
});
