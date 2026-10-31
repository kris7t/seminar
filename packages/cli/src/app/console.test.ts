import { EventEmitter } from 'node:events';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { WebContents } from 'electron';

import {
  forwardConsole,
  formatConsoleCall,
  type RemoteObject,
} from './console.ts';

const text = (value: string): RemoteObject => ({ type: 'string', value });

const ERROR: RemoteObject = {
  type: 'object',
  subtype: 'error',
  description: 'Error: Foo\n    at Input (input.tsx:1:2)',
  preview: { overflow: false, properties: [] },
};

describe('formatConsoleCall', () => {
  it('prints the errors that React reports with their stacks', () => {
    expect(
      formatConsoleCall([
        text('%o\n\n%s\n\n%s\n'),
        ERROR,
        text('The above error occurred in the <Input> component.'),
        text('React will try to recreate this component tree.'),
      ]),
    ).toBe(
      'Error: Foo\n    at Input (input.tsx:1:2)\n\nThe above error occurred in the <Input> component.\n\nReact will try to recreate this component tree.',
    );
  });

  it('prints errors without a format string', () => {
    expect(formatConsoleCall([ERROR])).toBe(ERROR.description);
  });

  it('substitutes every format specifier that has a value', () => {
    expect(
      formatConsoleCall([
        text('%d%% %i %f %cstyled %s %s'),
        { type: 'number', value: 1, description: '1' },
        { type: 'number', value: 2, description: '2' },
        { type: 'number', value: 3.5, description: '3.5' },
        text('color: red'),
        text('last'),
      ]),
    ).toBe('1% 2 3.5 styled last %s');
  });

  it('prints the values left over after the format string', () => {
    expect(formatConsoleCall([text('100%z'), text('a'), text('b')])).toBe(
      '100%z a b',
    );
  });

  it('prints every kind of value', () => {
    expect(
      formatConsoleCall([
        { type: 'undefined' },
        { type: 'object', subtype: 'null', value: null },
        { type: 'boolean', value: true },
        { type: 'bigint', description: '1n' },
        { type: 'symbol', description: 'Symbol(x)' },
        { type: 'function', description: '()=>1' },
        {
          type: 'object',
          subtype: 'map',
          description: 'Map(1)',
          preview: {
            overflow: false,
            properties: [{ name: 'size', type: 'number', value: '1' }],
          },
        },
      ]),
    ).toBe('undefined null true 1n Symbol(x) ()=>1 Map(1)');
  });

  it('prints the properties of objects and the items of arrays', () => {
    expect(
      formatConsoleCall([
        {
          type: 'object',
          description: 'Object',
          preview: {
            overflow: false,
            properties: [
              { name: 'a', type: 'number', value: '1' },
              { name: 'b', type: 'accessor' },
            ],
          },
        },
        {
          type: 'object',
          description: 'Point',
          preview: {
            overflow: true,
            properties: [{ name: 'x', type: 'number', value: '1' }],
          },
        },
        {
          type: 'object',
          subtype: 'array',
          description: 'Array(2)',
          preview: {
            overflow: false,
            properties: [
              { name: '0', type: 'number', value: '1' },
              { name: '1', type: 'object', value: 'Object' },
            ],
          },
        },
      ]),
    ).toBe('{a: 1, b: accessor} Point {x: 1, …} [1, Object]');
  });
});

describe('forwardConsole', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  function forward() {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const devTools = Object.assign(new EventEmitter(), {
      attach: vi.fn(),
      sendCommand: vi.fn(() => Promise.resolve({})),
    });
    forwardConsole(
      { debugger: devTools } as unknown as Pick<WebContents, 'debugger'>,
      'deck.html',
    );
    return {
      devTools,
      log,
      emit: (method: string, params: object) => {
        devTools.emit('message', {}, method, params);
      },
    };
  }

  it('listens to the page before it loads, without waiting for it', () => {
    const { devTools } = forward();
    expect(devTools.attach).toHaveBeenCalledOnce();
    expect(devTools.sendCommand.mock.calls).toEqual([
      ['Runtime.enable', undefined],
      ['Log.enable', undefined],
    ]);
  });

  it('prints errors, warnings, and failed assertions', () => {
    const { emit, log } = forward();
    for (const type of ['error', 'warning', 'assert', 'log', 'debug']) {
      emit('Runtime.consoleAPICalled', { type, args: [text(type)] });
    }
    expect(log.mock.calls).toEqual([
      ['deck.html: error'],
      ['deck.html: warning'],
      ['deck.html: assert'],
    ]);
  });

  it('prints uncaught exceptions with their stacks', () => {
    const { emit, log } = forward();
    emit('Runtime.exceptionThrown', {
      exceptionDetails: { text: 'Uncaught', exception: ERROR },
    });
    emit('Runtime.exceptionThrown', {
      exceptionDetails: { text: 'Script error.' },
    });
    expect(log.mock.calls).toEqual([
      [`deck.html: Uncaught ${String(ERROR.description)}`],
      ['deck.html: Script error.'],
    ]);
  });

  it('prints errors and warnings that Chromium reports by itself', () => {
    const { emit, log } = forward();
    for (const level of ['error', 'warning', 'info', 'verbose']) {
      emit('Log.entryAdded', { entry: { level, text: level } });
    }
    expect(log.mock.calls).toEqual([
      ['deck.html: error'],
      ['deck.html: warning'],
    ]);
  });

  it('does not keep reported values alive', () => {
    const { devTools, emit } = forward();
    devTools.sendCommand.mockClear();
    emit('Runtime.consoleAPICalled', { type: 'log', args: [] });
    expect(devTools.sendCommand).toHaveBeenCalledWith(
      'Runtime.releaseObjectGroup',
      { objectGroup: 'console' },
    );
  });

  it('ignores that the window closed', async () => {
    const { devTools, emit } = forward();
    devTools.sendCommand.mockClear();
    devTools.sendCommand.mockRejectedValue(new Error('Target closed'));
    emit('Runtime.consoleAPICalled', { type: 'log', args: [] });
    expect(devTools.sendCommand).toHaveBeenCalledOnce();
    // Vitest fails the run if the rejection stays unhandled.
    await new Promise((resolve) => setImmediate(resolve));
  });
});
