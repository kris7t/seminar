import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { recordRelease } from './record-release.mjs';

function repository(t) {
  const temporary = mkdtempSync(path.join(os.tmpdir(), 'seminar-release-git-'));
  t.after(() => rmSync(temporary, { recursive: true, force: true }));
  const directory = path.join(temporary, 'checkout');
  const origin = path.join(temporary, 'origin.git');
  const git = (...args) =>
    execFileSync('git', args, {
      cwd: directory,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  execFileSync('git', ['init', '--bare', origin], { stdio: 'ignore' });
  execFileSync('git', ['init', '-b', 'main', directory], { stdio: 'ignore' });
  git('config', 'user.name', 'Release Test');
  git('config', 'user.email', 'release@example.invalid');
  git('config', 'commit.gpgsign', 'false');
  git('config', 'tag.gpgsign', 'false');
  writeFileSync(path.join(directory, 'package.json'), '{"version":"0.0.0"}\n');
  git('add', '.');
  git('commit', '-m', 'Initial version');
  git('remote', 'add', 'origin', origin);
  git('push', 'origin', 'main');
  const base = git('rev-parse', 'HEAD');
  writeFileSync(path.join(directory, 'package.json'), '{"version":"0.1.0"}\n');
  const patchFile = path.join(temporary, 'version.patch');
  writeFileSync(patchFile, `${git('diff', '--binary')}\n`);
  git('restore', '.');
  return { git, directory, base, tag: 'v0.1.0', patchFile };
}

test('recording a release atomically pushes the tested version and reuses it on retry', (t) => {
  const repo = repository(t);
  const commit = recordRelease(repo);
  assert.notEqual(commit, repo.base);
  assert.equal(repo.git('rev-parse', 'origin/main'), commit);
  assert.equal(repo.git('rev-list', '-n', '1', repo.tag), commit);
  assert.match(repo.git('log', '-1', '--format=%B'), /Co-Authored-By: Codex/);
  repo.git('checkout', '--detach', repo.base);
  assert.equal(recordRelease(repo), commit);
  assert.equal(repo.git('rev-parse', 'HEAD'), commit);
});

test('a concurrent change to main prevents both the version push and tag push', (t) => {
  const repo = repository(t);
  repo.git('commit', '--allow-empty', '-m', 'Concurrent change');
  const concurrent = repo.git('rev-parse', 'HEAD');
  repo.git('push', 'origin', 'main');
  repo.git('checkout', '--detach', repo.base);
  assert.throws(() => recordRelease(repo));
  assert.equal(repo.git('rev-parse', 'origin/main'), concurrent);
  assert.equal(repo.git('ls-remote', '--tags', 'origin', repo.tag), '');
});

test('a conflicting tag or dirty checkout cannot be reused as a release', (t) => {
  const repo = repository(t);
  repo.git('tag', repo.tag);
  assert.throws(() => recordRelease(repo), /differs from the verified release/);
  writeFileSync(path.join(repo.directory, 'package.json'), 'changed');
  assert.throws(() => recordRelease(repo), /clean checkout/);
});
