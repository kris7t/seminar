import type { WebContents } from 'electron';

/** A value in a page, as the Chrome DevTools Protocol reports it. */
export interface RemoteObject {
  type: string;
  subtype?: string;
  value?: unknown;
  /** Text of values other than strings and booleans, e.g., errors with stacks. */
  description?: string;
  preview?: {
    overflow: boolean;
    properties: readonly { name: string; type: string; value?: string }[];
  };
}

interface ConsoleCall {
  type: string;
  args: RemoteObject[];
}

interface ThrownException {
  exceptionDetails: { text: string; exception?: RemoteObject };
}

interface LogEntry {
  entry: { level: string; text: string };
}

function formatValue(object: RemoteObject): string {
  const { subtype, value, description, preview } = object;
  if (preview === undefined || (subtype !== undefined && subtype !== 'array')) {
    return description ?? String(value);
  }
  const more = preview.overflow ? ['…'] : [];
  if (subtype === 'array') {
    const items = preview.properties.map((item) => item.value ?? item.type);
    return `[${[...items, ...more].join(', ')}]`;
  }
  const properties = preview.properties.map(
    ({ name, type, value }) => `${name}: ${value ?? type}`,
  );
  const body = `{${[...properties, ...more].join(', ')}}`;
  return description === 'Object' ? body : `${description ?? ''} ${body}`;
}

/**
 * Returns what a call of `console` with `args` prints. Chromium has already
 * converted the values of the numeric format specifiers.
 */
export function formatConsoleCall(args: readonly RemoteObject[]): string {
  const [format, ...rest] = args;
  if (format?.type !== 'string') {
    return args.map(formatValue).join(' ');
  }
  const message = String(format.value).replace(
    /%([sdifoOc%])/g,
    (specifier, kind: string) => {
      if (kind === '%') {
        return '%';
      }
      const value = rest.shift();
      if (value === undefined) {
        return specifier;
      }
      return kind === 'c' ? '' : formatValue(value);
    },
  );
  return [message, ...rest.map(formatValue)].join(' ').trimEnd();
}

/**
 * Prints the errors and warnings of `webContents`, starting with `name`. The
 * `console-message` event would only tell the format string of a call of
 * `console` and its arguments next to it, without the stacks of errors.
 */
export function forwardConsole(
  webContents: Pick<WebContents, 'debugger'>,
  name: string,
): void {
  const devTools = webContents.debugger;
  const send = (method: string, params?: object) => {
    // It fails once the window is closed, and it doesn't answer until the
    // window loads something, so nothing can wait for it.
    devTools.sendCommand(method, params).catch(() => undefined);
  };
  const print = (message: string) => {
    console.log(`${name}: ${message}`);
  };
  // Values reported to us would be kept alive until the page is closed.
  const releaseValues = () => {
    send('Runtime.releaseObjectGroup', { objectGroup: 'console' });
  };
  devTools.on('message', (_, method, params) => {
    switch (method) {
      case 'Runtime.consoleAPICalled': {
        const { type, args } = params as ConsoleCall;
        if (type === 'error' || type === 'warning' || type === 'assert') {
          print(formatConsoleCall(args));
        }
        releaseValues();
        break;
      }
      case 'Runtime.exceptionThrown': {
        const { text, exception } = (params as ThrownException)
          .exceptionDetails;
        print(
          exception === undefined ? text : `${text} ${formatValue(exception)}`,
        );
        releaseValues();
        break;
      }
      case 'Log.entryAdded': {
        // What Chromium reports by itself, e.g., resources that failed to load.
        const { level, text } = (params as LogEntry).entry;
        if (level === 'error' || level === 'warning') {
          print(text);
        }
        break;
      }
      default:
    }
  });
  devTools.attach();
  send('Runtime.enable');
  send('Log.enable');
}
