#!/usr/bin/env node
import { Interrupted, run } from './cli.ts';

// Don't outlive the program that started us with a channel, e.g., an editor.
process.once('disconnect', () => {
  process.kill(process.pid, 'SIGTERM');
});

try {
  await run(process.argv.slice(2));
} catch (error) {
  if (error instanceof Interrupted) {
    // Having cleaned up, stop with the signal, as if we hadn't handled it.
    process.kill(process.pid, error.signal);
  } else {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
