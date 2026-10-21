import assert from 'node:assert/strict';
import * as release from './release.mjs';
import { test } from 'node:test';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  distTag,
  validatePack,
  validateVersion,
  verifyArtifact,
  publishedIntegrity,
} from './release.mjs';

test('release versions reject malformed or ambiguous versions', () => {
  for (const version of ['0.1.0', '1.2.3-rc.1', '0.2.0-beta.0'])
    assert.equal(validateVersion(version), version);
  for (const version of [
    undefined,
    '',
    'v0.1.0',
    '01.2.3',
    '0.1',
    '1.2.3-01',
    '1.2.3+metadata',
    '1.2.3-',
  ])
    assert.throws(() => validateVersion(version));
  assert.equal(distTag('0.1.0'), 'latest');
  assert.equal(distTag('0.2.0-rc.1'), 'next');
});

test('tarball validation catches missing exports, licenses and accidentally packed test files', () => {
  const pkg = {
    name: '@seminar/test',
    exports: {
      '.': { types: './dist/index.d.ts', default: './dist/index.js' },
      './locales/*.json': './dist/locales/*.json',
    },
  };
  const names = [
    'package.json',
    'README.md',
    'LICENSE',
    'dist/index.js',
    'dist/index.d.ts',
    'dist/locales/en.json',
  ];
  const packed = (files) => ({ files: files.map((name) => ({ path: name })) });
  validatePack(pkg, packed(names));
  for (const missing of names)
    assert.throws(() =>
      validatePack(pkg, packed(names.filter((name) => name !== missing))),
    );
  for (const extra of [
    'src/fixtures/example.mdx',
    'src/test/helper.ts',
    'dist/component.test.js',
    'dist/.tsbuildinfo',
  ])
    assert.throws(() => validatePack(pkg, packed([...names, extra])));
});

test('publication verifies artifact contents before contacting npm', () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'seminar-integrity-'));
  try {
    const file = path.join(directory, 'package.tgz');
    writeFileSync(file, 'verified package');
    const item = {
      filename: 'package.tgz',
      integrity: `sha512-${createHash('sha512').update('verified package').digest('base64')}`,
    };
    assert.equal(verifyArtifact(item, directory), file);
    writeFileSync(file, 'changed package');
    assert.throws(() => verifyArtifact(item, directory), /integrity mismatch/);
    assert.throws(
      () => verifyArtifact({ ...item, filename: '../package.tgz' }, directory),
      /Invalid artifact/,
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('release retries accept the integrity response shapes of npm 11 and 12', () => {
  assert.equal(publishedIntegrity('sha512-verified'), 'sha512-verified');
  assert.equal(publishedIntegrity(['sha512-verified']), 'sha512-verified');
  for (const response of [[], ['a', 'b'], null, {}])
    assert.throws(() => publishedIntegrity(response));
});

test('major, minor, and patch releases follow semver bump rules', () => {
  for (const [version, bump, expected] of [
    ['0.0.0', 'minor', '0.1.0'],
    ['0.1.9', 'patch', '0.1.10'],
    ['0.1.9', 'minor', '0.2.0'],
    ['0.1.9', 'major', '1.0.0'],
    ['1.0.0-rc.1', 'major', '1.0.0'],
    ['1.2.0-rc.1', 'minor', '1.2.0'],
    ['1.2.3-rc.1', 'patch', '1.2.3'],
  ])
    assert.equal(release.bumpVersion(version, bump), expected);
  assert.throws(() => release.bumpVersion('1.2.3', 'other'));
});

function publication(t) {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'seminar-publish-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const item = {
    name: '@seminar/test',
    version: '0.1.0',
    filename: 'test.tgz',
    integrity: `sha512-${createHash('sha512').update('package contents').digest('base64')}`,
  };
  writeFileSync(path.join(directory, item.filename), 'package contents');
  writeFileSync(path.join(directory, 'manifest.json'), JSON.stringify([item]));
  const stageId = '12345678-1234-1234-1234-123456789abc';
  const calls = [];
  const options = {
    directory,
    provenance: true,
    runNpm: (args) => {
      calls.push(args);
      if (args[0] === 'view')
        throw Object.assign(new Error('Not published'), {
          stdout: JSON.stringify({ error: { code: 'E404' } }),
        });
      return JSON.stringify({ [item.name]: { ...item, stageId } });
    },
  };
  return { item, options, calls, stageId };
}

test('publishing defaults to staging verified artifacts and saves retry receipts', (t) => {
  const { item, options, calls, stageId } = publication(t);
  const checkpoints = [];
  options.onProgress = (file) =>
    checkpoints.push(JSON.parse(readFileSync(file)));
  const results = release.publishArtifacts([item], options);
  assert.equal(results[0].status, 'staged');
  assert.equal(results[0].stageId, stageId);
  assert.equal(checkpoints.length, 1);
  assert.deepEqual(calls[1].slice(0, 2), ['stage', 'publish']);
  assert.ok(calls[1].includes('--provenance'));
  assert.ok(calls[1].includes(path.join(options.directory, item.filename)));
  assert.equal(results[0].file, undefined);

  calls.length = 0;
  assert.deepEqual(release.publishArtifacts([item], options), results);
  assert.deepEqual(
    calls.map((args) => args[0]),
    ['view'],
  );
  assert.throws(
    () => release.publishArtifacts([item], { ...options, mode: 'direct' }),
    /already staged/,
  );
});

test('direct publishing skips staging and accepts already published identical artifacts', (t) => {
  const { item, options, calls } = publication(t);
  const results = release.publishArtifacts([item], {
    ...options,
    mode: 'direct',
  });
  assert.equal(results[0].status, 'published');
  assert.equal(results[0].stageId, undefined);
  assert.equal(calls[1][0], 'publish');
  options.runNpm = (args) => {
    assert.equal(args[0], 'view');
    return JSON.stringify(item.integrity);
  };
  assert.deepEqual(release.publishArtifacts([item], options), results);
  options.runNpm = () => JSON.stringify('sha512-other');
  assert.throws(
    () => release.publishArtifacts([item], options),
    /different contents/,
  );
});

test('a staged upload remains recoverable when saving its remote receipt fails', (t) => {
  const { item, options, calls, stageId } = publication(t);
  options.onProgress = () => {
    throw new Error('GitHub unavailable');
  };
  assert.throws(
    () => release.publishArtifacts([item], options),
    /GitHub unavailable/,
  );
  const receipt = JSON.parse(
    readFileSync(path.join(options.directory, 'publish-results.json')),
  );
  assert.equal(receipt[0].stageId, stageId);
  calls.length = 0;
  delete options.onProgress;
  release.publishArtifacts([item], options);
  assert.deepEqual(
    calls.map((args) => args[0]),
    ['view'],
  );
});

test('publishing checks every artifact before npm and preserves registry errors', (t) => {
  const { item, options, calls } = publication(t);
  assert.throws(
    () => release.publishArtifacts([item], { ...options, mode: 'invalid' }),
    /Choose staged or direct/,
  );
  assert.throws(
    () => release.publishArtifacts([item, { name: 'missing' }], options),
    /Missing release artifact/,
  );
  assert.equal(calls.length, 0);
  const networkError = Object.assign(new Error('Registry unavailable'), {
    stdout: JSON.stringify({ error: { code: 'E503' } }),
  });
  options.runNpm = () => {
    throw networkError;
  };
  assert.throws(
    () => release.publishArtifacts([item], options),
    (error) => error === networkError,
  );
  writeFileSync(path.join(options.directory, item.filename), 'corrupted');
  assert.throws(
    () => release.publishArtifacts([item], options),
    /integrity mismatch/,
  );
});

test('stage identifiers accept npm response shapes and reject incomplete receipts', () => {
  const entry = {
    name: '@seminar/test',
    stageId: '12345678-1234-1234-1234-123456789abc',
  };
  for (const response of [entry, [entry], { [entry.name]: entry }])
    assert.equal(release.stageIdentifier(response, entry.name), entry.stageId);
  for (const response of [{}, [], [{ ...entry, stageId: undefined }]])
    assert.throws(
      () => release.stageIdentifier(response, entry.name),
      /stage ID/,
    );
});
