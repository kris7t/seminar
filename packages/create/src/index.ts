#!/usr/bin/env node
import { Canceled, run } from './cli.ts';

try {
  await run(process.argv.slice(2));
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = error instanceof Canceled ? 130 : 1;
}
