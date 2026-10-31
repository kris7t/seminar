import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  appendFileSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const root = fileURLToPath(new URL('../', import.meta.url));
export const artifacts = path.join(root, 'artifacts/npm');
// Publish dependencies before the packages that use them.
export const libraries = [
  'core',
  'mdx',
  'elements',
  'theme-default',
  'plugin-mathjax',
  'plugin-pele',
  'plugin-shiki',
  'rollup-plugin',
  'vite-plugin',
];
export const releaseWorkspaces = [...libraries, 'create', 'cli'];
const registry = 'https://registry.npmjs.org/';
const dependencyFields = [
  'dependencies',
  'devDependencies',
  'peerDependencies',
  'optionalDependencies',
];
const readJson = (file) => JSON.parse(readFileSync(file, 'utf8'));
const writeJson = (file, value) =>
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
const manifests = () =>
  releaseWorkspaces.map((directory) => ({
    directory,
    ...readJson(path.join(root, 'packages', directory, 'package.json')),
  }));
const npm = (args, options = {}) =>
  execFileSync('npm', args, { cwd: root, encoding: 'utf8', ...options });
const tsc = (...configs) =>
  execFileSync(
    process.execPath,
    [path.join(root, 'node_modules/typescript/bin/tsc'), '--build', ...configs],
    { cwd: root, stdio: 'inherit' },
  );
const config = (directory) => {
  const base = path.join(root, 'packages', directory);
  return path.join(
    base,
    existsSync(path.join(base, 'tsconfig.lib.json'))
      ? 'tsconfig.lib.json'
      : 'tsconfig.json',
  );
};

export function validateVersion(version) {
  const number = '(?:0|[1-9]\\d*)';
  const identifier = '(?:0|[1-9]\\d*|\\d*[A-Za-z-][0-9A-Za-z-]*)';
  if (
    !new RegExp(
      `^${number}\\.${number}\\.${number}(?:-${identifier}(?:\\.${identifier})*)?$`,
    ).test(version)
  ) {
    throw new Error(
      `Expected a release version such as 0.1.0 or 0.2.0-rc.1, got ${version}`,
    );
  }
  return version;
}

export function bumpVersion(version, bump) {
  validateVersion(version);
  const [stable, prerelease] = version.split('-');
  let [major, minor, patch] = stable.split('.').map(Number);
  switch (bump) {
    case 'major':
      if (prerelease === undefined || minor !== 0 || patch !== 0) major += 1;
      minor = 0;
      patch = 0;
      break;
    case 'minor':
      if (prerelease === undefined || patch !== 0) minor += 1;
      patch = 0;
      break;
    case 'patch':
      if (prerelease === undefined) patch += 1;
      break;
    default:
      throw new Error('Choose a major, minor, or patch release');
  }
  return validateVersion(`${major}.${minor}.${patch}`);
}

export function distTag(version) {
  return validateVersion(version).includes('-') ? 'next' : 'latest';
}

export function checkRelease(tag) {
  const packages = manifests();
  const version = validateVersion(packages[0].version);
  if (tag !== undefined && tag !== `v${version}`)
    throw new Error(`Release tag ${tag} must match v${version}`);
  for (const pkg of packages) {
    if (
      pkg.private ||
      pkg.version !== version ||
      pkg.publishConfig?.access !== 'public' ||
      pkg.publishConfig?.registry !== registry
    ) {
      throw new Error(
        `${pkg.name} must be public and use the shared release version ${version} and npm registry`,
      );
    }
  }
  const names = new Set(packages.map((pkg) => pkg.name));
  for (const directory of [...releaseWorkspaces, 'example', 'docs', 'vscode']) {
    const pkg = readJson(
      path.join(root, 'packages', directory, 'package.json'),
    );
    for (const field of dependencyFields) {
      for (const [name, range] of Object.entries(pkg[field] ?? {})) {
        if (names.has(name) && range !== version)
          throw new Error(
            `${pkg.name}: ${field}.${name} must be ${version}, got ${range}`,
          );
      }
    }
  }
  return packages;
}

function setVersion(version) {
  if (['major', 'minor', 'patch'].includes(version))
    version = bumpVersion(checkRelease()[0].version, version);
  validateVersion(version);
  const names = new Set(manifests().map((pkg) => pkg.name));
  for (const directory of [...releaseWorkspaces, 'example', 'docs', 'vscode']) {
    const file = path.join(root, 'packages', directory, 'package.json');
    const pkg = readJson(file);
    if (names.has(pkg.name)) pkg.version = version;
    for (const field of dependencyFields) {
      for (const name of Object.keys(pkg[field] ?? {}))
        if (names.has(name)) pkg[field][name] = version;
    }
    writeJson(file, pkg);
  }
  npm(
    [
      'install',
      '--package-lock-only',
      '--ignore-scripts',
      '--no-audit',
      '--no-fund',
    ],
    { stdio: 'inherit' },
  );
  console.log(`Release version: ${version}`);
  if (process.env.GITHUB_OUTPUT !== undefined)
    appendFileSync(
      process.env.GITHUB_OUTPUT,
      `version=${version}\ntag=v${version}\n`,
    );
}

function prepare(directory) {
  tsc(config(directory));
  copyFileSync(
    path.join(root, 'LICENSE'),
    path.join(root, 'packages', directory, 'LICENSE'),
  );
}

function build() {
  for (const directory of releaseWorkspaces)
    rmSync(path.join(root, 'packages', directory, 'dist'), {
      recursive: true,
      force: true,
    });
  tsc(...releaseWorkspaces.map(config));
  for (const directory of releaseWorkspaces)
    copyFileSync(
      path.join(root, 'LICENSE'),
      path.join(root, 'packages', directory, 'LICENSE'),
    );
}

export function validatePack(pkg, packed) {
  const files = new Set(packed.files.map((file) => file.path));
  for (const required of [
    'package.json',
    'README.md',
    'LICENSE',
    'dist/index.js',
    'dist/index.d.ts',
  ]) {
    if (!files.has(required))
      throw new Error(`${pkg.name}: missing ${required} in tarball`);
  }
  for (const file of files) {
    if (/\.test\.|\/(?:test|fixtures)\/|\.tsbuildinfo$/.test(file))
      throw new Error(`${pkg.name}: unexpected ${file} in tarball`);
  }
  const checkExports = (entry) => {
    if (typeof entry === 'string') {
      const [prefix, suffix] = entry.replace(/^\.\//, '').split('*');
      const found =
        suffix === undefined
          ? files.has(prefix)
          : [...files].some(
              (file) => file.startsWith(prefix) && file.endsWith(suffix),
            );
      if (!found) throw new Error(`${pkg.name}: missing export ${entry}`);
    } else if (entry !== null && typeof entry === 'object')
      Object.values(entry).forEach(checkExports);
  };
  checkExports(pkg.exports);
  checkExports(pkg.bin);
}

function pack(tag) {
  const packages = checkRelease(tag);
  rmSync(artifacts, { recursive: true, force: true });
  mkdirSync(artifacts, { recursive: true });
  build();
  const result = JSON.parse(
    npm([
      'pack',
      '--json',
      '--ignore-scripts',
      '--pack-destination',
      artifacts,
      ...packages.map((pkg) => `--workspace=${pkg.name}`),
    ]),
  );
  // npm 11 returns an array; npm 12 keys the results by workspace name.
  const packed = Array.isArray(result) ? result : Object.values(result);
  const manifest = packages.map((pkg) => {
    const item = packed.find((entry) => entry.name === pkg.name);
    if (item === undefined)
      throw new Error(`npm pack did not return ${pkg.name}`);
    validatePack(pkg, item);
    return {
      name: item.name,
      version: item.version,
      filename: item.filename,
      integrity: item.integrity,
    };
  });
  writeJson(path.join(artifacts, 'manifest.json'), manifest);
  for (const pkg of manifest)
    console.log(`${pkg.name}@${pkg.version}: ${pkg.filename}`);
}

export function verifyArtifact(item, directory = artifacts) {
  if (path.basename(item.filename) !== item.filename)
    throw new Error('Invalid artifact filename');
  const file = path.join(directory, item.filename);
  const integrity = `sha512-${createHash('sha512').update(readFileSync(file)).digest('base64')}`;
  if (integrity !== item.integrity)
    throw new Error(`Artifact integrity mismatch: ${item.filename}`);
  return file;
}

export function publishedIntegrity(result) {
  const values = Array.isArray(result) ? result : [result];
  if (values.length !== 1 || typeof values[0] !== 'string')
    throw new Error('Unexpected npm integrity response');
  return values[0];
}

export function stageIdentifier(result, name) {
  const items = Array.isArray(result)
    ? result
    : result.stageId === undefined
      ? Object.values(result)
      : [result];
  const item = items.find((entry) => entry.name === name);
  if (
    typeof item?.stageId !== 'string' ||
    !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(item.stageId)
  )
    throw new Error(`npm did not return a stage ID for ${name}`);
  return item.stageId;
}

export function publishArtifacts(
  packages,
  {
    mode = 'staged',
    directory = artifacts,
    runNpm = npm,
    onProgress,
    provenance = process.env.GITHUB_ACTIONS === 'true',
  } = {},
) {
  if (!['staged', 'direct'].includes(mode))
    throw new Error('Choose staged or direct npm publishing');
  const packed = readJson(path.join(directory, 'manifest.json'));
  const work = packages.map((pkg) => {
    const item = packed.find(
      (entry) => entry.name === pkg.name && entry.version === pkg.version,
    );
    if (item === undefined)
      throw new Error(
        `Missing release artifact for ${pkg.name}@${pkg.version}`,
      );
    return { ...item, file: verifyArtifact(item, directory) };
  });
  const resultsFile = path.join(directory, 'publish-results.json');
  const results = existsSync(resultsFile) ? readJson(resultsFile) : [];
  for (const item of work) {
    let integrity;
    try {
      integrity = publishedIntegrity(
        JSON.parse(
          runNpm(
            [
              'view',
              `${item.name}@${item.version}`,
              'dist.integrity',
              '--json',
              '--registry',
              registry,
            ],
            { stdio: ['ignore', 'pipe', 'pipe'] },
          ),
        ),
      );
    } catch (error) {
      const response = JSON.parse(error.stdout || '{}');
      if (response.error?.code !== 'E404') throw error;
    }
    let result;
    const previous = results.find(
      (entry) => entry.name === item.name && entry.version === item.version,
    );
    if (previous !== undefined && previous.integrity !== item.integrity)
      throw new Error(
        `Previous publishing result has different contents: ${item.name}`,
      );
    if (integrity !== undefined) {
      if (integrity !== item.integrity)
        throw new Error(
          `${item.name}@${item.version} already exists with different contents`,
        );
      result = { ...item, status: 'published' };
    } else if (previous?.status === 'staged') {
      if (mode === 'direct')
        throw new Error(
          `${item.name}@${item.version} is already staged; approve or reject it in npm before publishing directly`,
        );
      result = previous;
    } else {
      const output = JSON.parse(
        runNpm(
          [
            ...(mode === 'staged' ? ['stage'] : []),
            'publish',
            item.file,
            '--json',
            '--access',
            'public',
            '--registry',
            registry,
            '--tag',
            distTag(item.version),
            ...(provenance ? ['--provenance'] : []),
          ],
          { stdio: ['ignore', 'pipe', 'inherit'] },
        ),
      );
      result = {
        ...item,
        status: mode === 'staged' ? 'staged' : 'published',
        ...(mode === 'staged'
          ? { stageId: stageIdentifier(output, item.name) }
          : {}),
      };
    }
    delete result.file;
    const index = results.findIndex(
      (entry) => entry.name === item.name && entry.version === item.version,
    );
    if (index === -1) results.push(result);
    else results[index] = result;
    writeJson(resultsFile, results);
    onProgress?.(resultsFile);
    console.log(
      `${result.name}@${result.version}: ${result.status}${result.stageId === undefined ? '' : ` (${result.stageId})`}`,
    );
  }
  return results;
}

function publish(mode, tag) {
  const packages = checkRelease(tag);
  const results = publishArtifacts(packages, {
    mode,
    onProgress: (file) => {
      if (
        process.env.GITHUB_ACTIONS === 'true' &&
        process.env.RELEASE_TAG !== undefined
      )
        execFileSync(
          'gh',
          ['release', 'upload', process.env.RELEASE_TAG, file, '--clobber'],
          { cwd: root, stdio: 'inherit' },
        );
    },
  });
  const staged = results.some((entry) => entry.status === 'staged');
  const summary = `\n<!-- seminar-publish-status -->\n## npm packages\n\n${staged ? 'Packages are staged on npm and await maintainer approval with 2FA.' : 'Packages are published on npm.'}\n\n| Package | Version | Status | Stage ID |\n| --- | --- | --- | --- |\n${results.map((entry) => `| ${entry.name} | ${entry.version} | ${entry.status} | ${entry.stageId ?? '—'} |`).join('\n')}\n`;
  writeFileSync(path.join(artifacts, 'publish-results.md'), summary);
  if (process.env.GITHUB_STEP_SUMMARY !== undefined)
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary);
}

if (
  process.argv[1] !== undefined &&
  pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url
) {
  const [command, argument, tag] = process.argv.slice(2);
  switch (command) {
    case 'version':
      setVersion(argument);
      break;
    case 'check':
      console.log(
        `Release v${checkRelease(argument)[0].version} is consistent`,
      );
      break;
    case 'build':
      build();
      break;
    case 'prepare': {
      const directory = path.basename(process.cwd());
      if (
        !releaseWorkspaces.includes(directory) ||
        path.resolve(process.cwd()) !== path.join(root, 'packages', directory)
      )
        throw new Error('Run prepare from a release workspace');
      prepare(directory);
      break;
    }
    case 'pack':
      pack(argument);
      break;
    case 'publish':
      publish(argument ?? 'staged', tag);
      break;
    default:
      throw new Error(
        'Usage: node scripts/release.mjs <version VERSION_OR_BUMP|check [TAG]|build|prepare|pack [TAG]|publish [staged|direct] [TAG]>',
      );
  }
}
