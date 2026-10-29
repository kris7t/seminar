import { spawn } from 'node:child_process';
import path from 'node:path';
import { parseArgs } from 'node:util';
import prompts from 'prompts';
import {
  createProject,
  PDFS,
  PLUGINS,
  VERSION,
  type Pdf,
  type Plugin,
  type Theme,
} from './project.ts';

const HELP = `Usage: create-seminar [directory] [options]

Create a Seminar presentation with Vite.

  --plugins <list>          Comma-separated elements,mathjax,pele,shiki, or none
  --theme <default|custom>  Use the default theme or create src/theme.ts with Roboto
  --self-contained         Inline scripts and assets into HTML (default)
  --no-self-contained      Keep scripts and assets in separate files
  --pdf <list>              PDFs that npm run pdf saves: comma-separated
                            slides,notes,2up,4up,6up, or none
  --install                Install dependencies after creating the project (default)
  --no-install             Leave dependency installation for later
  -y, --yes                Use defaults for any choices not supplied
  -h, --help               Show this help
  -v, --version            Show the initializer version

Without flags, choose plugins, a theme, the build format, PDFs, and installation
interactively. With --yes, use my-talk, all plugins, the default theme,
self-contained builds, PDFs of the slides, and install dependencies.

Example:
  npm create seminar@latest my-talk -- --plugins elements,mathjax --theme custom --self-contained --install
`;

/** Raised when a prompt is canceled, before any files are created. */
export class Canceled extends Error {
  constructor() {
    super('Project creation canceled.');
  }
}

function pluginList(value: string): Plugin[] {
  if (value === 'none' || value === '') return [];
  const values = value.split(',').map((item) => item.trim());
  for (const item of values) {
    if (!PLUGINS.some((plugin) => plugin.value === item))
      throw new Error(
        `Unknown plugin ${JSON.stringify(item)}. Choose elements, mathjax, pele, shiki, or none.`,
      );
  }
  return PLUGINS.filter((plugin) => values.includes(plugin.value)).map(
    (plugin) => plugin.value,
  );
}

function pdfList(value: string): Pdf[] {
  if (value === 'none' || value === '') return [];
  const values = value.split(',').map((item) => item.trim());
  for (const item of values) {
    if (!PDFS.some((pdf) => pdf.value === item))
      throw new Error(
        `Unknown PDF ${JSON.stringify(item)}. Choose slides, notes, 2up, 4up, 6up, or none.`,
      );
  }
  return PDFS.filter((pdf) => values.includes(pdf.value)).map(
    (pdf) => pdf.value,
  );
}

function themeChoice(value: string): Theme {
  if (value !== 'default' && value !== 'custom')
    throw new Error('Choose --theme default or --theme custom.');
  return value;
}

/** Overrides for embedding or testing the command. */
export interface RunOptions {
  cwd?: string;
  interactive?: boolean;
  ask?: (questions: prompts.PromptObject[]) => Promise<Record<string, unknown>>;
  output?: (message: string) => void;
  /** Installs dependencies in the generated project. Defaults to npm install. */
  installDependencies?: (directory: string) => Promise<void>;
}

function quote(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

function installWithNpm(directory: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn('npm', ['install'], {
      cwd: directory,
      stdio: 'inherit',
      // Windows needs a shell to launch npm.cmd.
      shell: process.platform === 'win32',
    });
    child.once('error', reject);
    child.once('close', (code, signal) => {
      if (code === 0) resolve();
      else
        reject(
          new Error(
            signal === null
              ? `npm install exited with code ${String(code)}.`
              : `npm install stopped with signal ${signal}.`,
          ),
        );
    });
  });
}

/** Resolves CLI choices, optionally prompts, and writes a presentation project. */
export async function run(
  argv: string[],
  {
    cwd = process.cwd(),
    interactive = process.stdin.isTTY && process.stdout.isTTY,
    ask = (questions) =>
      prompts(questions, {
        onCancel: () => {
          throw new Canceled();
        },
      }),
    output = console.log,
    installDependencies = installWithNpm,
  }: RunOptions = {},
): Promise<void> {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    allowNegative: true,
    options: {
      plugins: { type: 'string' },
      theme: { type: 'string' },
      'self-contained': { type: 'boolean' },
      pdf: { type: 'string' },
      install: { type: 'boolean' },
      yes: { type: 'boolean', short: 'y' },
      help: { type: 'boolean', short: 'h' },
      version: { type: 'boolean', short: 'v' },
    },
  });
  if (values.help) {
    output(HELP);
    return;
  }
  if (values.version) {
    output(VERSION);
    return;
  }
  if (positionals.length > 1) throw new Error('Supply one project directory.');
  let directory = positionals[0];
  let plugins =
    values.plugins === undefined ? undefined : pluginList(values.plugins);
  let theme =
    values.theme === undefined ? undefined : themeChoice(values.theme);
  let selfContained = values['self-contained'];
  let pdfs = values.pdf === undefined ? undefined : pdfList(values.pdf);
  let install = values.install;
  if (!interactive) {
    selfContained ??= true;
    pdfs ??= ['slides'];
    install ??= true;
  }
  if (values.yes) {
    directory ??= 'my-talk';
    plugins ??= PLUGINS.map((plugin) => plugin.value);
    theme ??= 'default';
    selfContained ??= true;
    pdfs ??= ['slides'];
    install ??= true;
  }
  const questions: prompts.PromptObject[] = [];
  if (directory === undefined)
    questions.push({
      type: 'text',
      name: 'directory',
      message: 'Project directory',
      initial: 'my-talk',
      validate: (value: string) => value.trim() !== '' || 'Choose a directory',
    });
  if (plugins === undefined)
    questions.push({
      type: 'multiselect',
      name: 'plugins',
      message: 'Plugins',
      choices: PLUGINS.map((plugin) => ({
        title: plugin.title,
        value: plugin.value,
        selected: true,
      })),
      hint: 'Space to toggle, Enter to confirm',
    });
  if (theme === undefined)
    questions.push({
      type: 'select',
      name: 'theme',
      message: 'Theme',
      choices: [
        { title: 'Use the default theme', value: 'default' },
        {
          title: 'Create an editable src/theme.ts with Roboto',
          value: 'custom',
        },
      ],
    });
  if (selfContained === undefined)
    questions.push({
      type: 'toggle',
      name: 'selfContained',
      message:
        'Build self-contained HTML files with scripts and assets inlined?',
      initial: true,
      active: 'yes',
      inactive: 'no',
    });
  if (pdfs === undefined)
    questions.push({
      type: 'multiselect',
      name: 'pdfs',
      message: 'PDFs to save with npm run pdf',
      choices: PDFS.map((pdf) => ({
        title: pdf.title,
        value: pdf.value,
        selected: pdf.value === 'slides',
      })),
      hint: 'Space to toggle, Enter to confirm',
    });
  if (install === undefined)
    questions.push({
      type: 'toggle',
      name: 'install',
      message: 'Install dependencies now?',
      initial: true,
      active: 'yes',
      inactive: 'no',
    });
  if (questions.length > 0) {
    if (!interactive)
      throw new Error(
        'Supply a directory, --plugins elements,mathjax,pele,shiki (or none), and --theme default|custom; or use --yes for defaults. Builds are self-contained unless --no-self-contained is supplied.',
      );
    const answers = await ask(questions);
    if (directory === undefined && typeof answers['directory'] === 'string')
      directory = answers['directory'];
    if (
      plugins === undefined &&
      Array.isArray(answers['plugins']) &&
      answers['plugins'].every((value: unknown) => typeof value === 'string')
    )
      plugins = pluginList(answers['plugins'].join(','));
    if (theme === undefined && typeof answers['theme'] === 'string')
      theme = themeChoice(answers['theme']);
    if (
      selfContained === undefined &&
      typeof answers['selfContained'] === 'boolean'
    )
      selfContained = answers['selfContained'];
    if (
      pdfs === undefined &&
      Array.isArray(answers['pdfs']) &&
      answers['pdfs'].every((value: unknown) => typeof value === 'string')
    )
      pdfs = pdfList(answers['pdfs'].join(','));
    if (install === undefined && typeof answers['install'] === 'boolean')
      install = answers['install'];
  }
  if (
    directory === undefined ||
    directory.trim() === '' ||
    plugins === undefined ||
    theme === undefined ||
    selfContained === undefined ||
    pdfs === undefined ||
    install === undefined
  )
    throw new Canceled();
  const target = path.resolve(cwd, directory);
  createProject({ directory: target, plugins, theme, selfContained, pdfs });
  output(`Created ${target}`);
  const changeDirectory =
    target === path.resolve(cwd) ? '' : `  cd ${quote(directory)}\n`;
  if (install) {
    output('\nInstalling dependencies...\n');
    try {
      await installDependencies(target);
    } catch (error) {
      throw new Error(
        `Could not install dependencies: ${error instanceof Error ? error.message : String(error)}\n\nProject files are kept in ${target}.\nTo retry:\n${changeDirectory}  npm install`,
        { cause: error },
      );
    }
  }
  output(
    `\nNext steps:\n${changeDirectory}${install ? '' : '  npm install\n'}  npm run preview\n\nRun \`npm run dev\` to preview it in a browser instead.\nRun \`npm run present\` to present it with the presenter view.${
      pdfs.length === 0
        ? ''
        : '\nRun `npm run pdf` to save the presentation as PDF.'
    }`,
  );
}
