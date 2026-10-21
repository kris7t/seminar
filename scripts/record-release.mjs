import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { root, validateVersion } from './release.mjs';

/** Records exactly the version changes that passed release verification. */
export function recordRelease({ directory = root, base, tag, patchFile }) {
  if (typeof base !== 'string' || !/^[0-9a-f]{40,64}$/i.test(base))
    throw new Error('A release needs its verified source commit');
  validateVersion(tag?.startsWith('v') ? tag.slice(1) : undefined);
  const git = (...args) =>
    execFileSync('git', args, { cwd: directory, encoding: 'utf8' }).trim();
  if (git('status', '--porcelain') !== '')
    throw new Error('Record a release from a clean checkout');
  if (git('rev-parse', 'HEAD') !== base)
    throw new Error('The checkout must match the verified source commit');
  const patch = readFileSync(patchFile, 'utf8').trim();
  if (patch === '') throw new Error('The release version patch is empty');
  const tags = git('tag', '--list', tag);
  if (tags !== '') {
    if (git('diff', '--binary', base, tag) !== patch)
      throw new Error(`Existing tag ${tag} differs from the verified release`);
    git('checkout', '--detach', tag);
    return git('rev-parse', 'HEAD');
  }
  git('apply', '--index', patchFile);
  git(
    '-c',
    'user.name=github-actions[bot]',
    '-c',
    'user.email=41898282+github-actions[bot]@users.noreply.github.com',
    'commit',
    '-m',
    `Release Seminar ${tag}`,
    '-m',
    'Co-Authored-By: Codex <noreply@openai.com>',
  );
  git(
    '-c',
    'user.name=github-actions[bot]',
    '-c',
    'user.email=41898282+github-actions[bot]@users.noreply.github.com',
    'tag',
    '-a',
    tag,
    '-m',
    `Seminar ${tag}`,
  );
  // A concurrent update to main rejects both refs, preserving the tested tree.
  git('push', '--atomic', 'origin', 'HEAD:refs/heads/main', `refs/tags/${tag}`);
  return git('rev-parse', 'HEAD');
}

if (
  process.argv[1] !== undefined &&
  pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url
) {
  const [base, tag, patchFile] = process.argv.slice(2);
  console.log(recordRelease({ base, tag, patchFile }));
}
