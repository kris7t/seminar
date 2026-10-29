#!/usr/bin/env node
import { Interrupted, run } from './cli.ts';

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
