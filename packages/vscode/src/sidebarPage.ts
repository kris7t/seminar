import type { SourceRange } from './slideTable.ts';

/** An entry of the table of contents of a deck, see `TocList` in the core. */
export interface ContentsEntry {
  title: string;
  slideIndex: number;
  hasSlide: boolean;
  spare: boolean;
  /** The slide that this slide recaps, if it's a recap. */
  recapOf?: number | undefined;
  /** The first slide that recaps this slide, if any. */
  firstRecap?: number | undefined;
  steps: boolean;
  /** Whether the slide has state that it keeps when it is left. */
  state: boolean;
  stateChanged: boolean;
  children: ContentsEntry[];
}

/** The table of contents of a deck. */
export interface DeckContents {
  /** The slide of the current entry, if any. */
  current?: number | undefined;
  entries: ContentsEntry[];
}

/** Where a step is relative to the current one, see `StepTree` in the core. */
export type StepPhase = 'past' | 'open' | 'current' | 'shownWith' | 'future';

/** A step of the current slide of a deck. */
export interface StepEntry {
  path: number[];
  label: string;
  overlay: boolean;
  page: boolean;
  skipped: boolean;
  phase: StepPhase;
  children: StepEntry[];
}

/** Where a stepper is in the source of its deck. */
export interface StepSource extends SourceRange {
  /** The step that shows it first. */
  path: number[];
  /** Number of its last step on the level of `path`. */
  last: number;
  /** Whether it can be read at the current step. */
  visible: boolean;
}

/** The steps of a slide, and the current one. */
export interface SlideSteps {
  slideIndex: number;
  current: number[];
  startPhase: StepPhase;
  startPage: boolean;
  entries: StepEntry[];
  /** Where the steppers of the slide are in the source. */
  sources: StepSource[];
}

/** What a sidebar page asks the extension to do. */
export type SidebarMessage =
  | { type: 'ready' }
  | { type: 'preview' }
  | { type: 'goToSlide'; slideIndex: number }
  | { type: 'showSteps'; slideIndex: number }
  | { type: 'resetSlide'; slideIndex: number }
  | { type: 'goToStep'; path: number[] };

/** The paths of the icons of Material Design, by Google (Apache-2.0). */
const ICONS = {
  initial:
    'M14 4v5c0 1.12.37 2.16 1 3H9c.65-.86 1-1.9 1-3V4zm3-2H7c-.55 0-1 .45-1 1s.45 1 1 1h1v5c0 1.66-1.34 3-3 3v2h5.97v7l1 1 1-1v-7H19v-2c-1.66 0-3-1.34-3-3V4h1c.55 0 1-.45 1-1s-.45-1-1-1',
  overlay:
    'm11.99 18.54-7.37-5.73L3 14.07l9 7 9-7-1.63-1.27zM12 16l7.36-5.73L21 9l-9-7-9 7 1.63 1.27zm0-11.47L17.74 9 12 13.47 6.26 9z',
  page: 'M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8zM6 20V4h7v5h5v11z',
  recap: 'm11 9 1.42 1.42L8.83 14H18V4h2v12H8.83l3.59 3.58L11 21l-6-6z',
  recapped: 'm19 15-6 6-1.42-1.42L15.17 16H4V4h2v10h9.17l-3.59-3.58L13 9z',
  spare:
    'M20 2H4c-1 0-2 .9-2 2v3.01c0 .72.43 1.34 1 1.69V20c0 1.1 1.1 2 2 2h14c.9 0 2-.9 2-2V8.7c.57-.35 1-.97 1-1.69V4c0-1.1-1-2-2-2m-1 18H5V9h14zm1-13H4V4h16zM9 12h6v2H9z',
  state:
    'M9.4 16.6 4.8 12l4.6-4.6L8 6l-6 6 6 6zm5.2 0 4.6-4.6-4.6-4.6L16 6l6 6-6 6z',
  steps:
    'M14 2H4c-1.1 0-2 .9-2 2v10h2V4h10zm4 4H8c-1.1 0-2 .9-2 2v10h2V8h10zm2 4h-8c-1.1 0-2 .9-2 2v8c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2v-8c0-1.1-.9-2-2-2m0 10h-8v-8h8z',
} as const;

function escapeHtml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function action(message: SidebarMessage): string {
  return `data-message="${escapeHtml(JSON.stringify(message))}"`;
}

function icon(name: keyof typeof ICONS, title: string): string {
  return `<svg class="icon" viewBox="0 0 24 24" role="img" aria-label="${escapeHtml(title)}"><title>${escapeHtml(title)}</title><path d="${ICONS[name]}"/></svg>`;
}

function iconButton(
  name: keyof typeof ICONS,
  title: string,
  message: SidebarMessage,
  changed = false,
): string {
  return `<button class="mark${changed ? ' changed' : ''}" title="${escapeHtml(title)}" aria-label="${escapeHtml(title)}" ${action(message)}>${icon(name, title)}</button>`;
}

function row(
  level: number,
  classes: readonly string[],
  message: SidebarMessage,
  current: 'page' | 'step' | undefined,
  label: string,
  marks: string,
  buttons: string,
): string {
  return `<div class="row${current === undefined ? '' : ' current'}" style="--level:${String(level)}"><button class="entry" ${action(message)}${current === undefined ? '' : ` aria-current="${current}"`}><span class="label ${classes.join(' ')}" title="${escapeHtml(label)}">${escapeHtml(label)}</span>${marks}</button>${buttons}</div>`;
}

function contentsRows(
  entries: readonly ContentsEntry[],
  current: number | undefined,
  level: number,
): string {
  return entries
    .map((entry) => {
      const { slideIndex, hasSlide, spare, recapOf, firstRecap } = entry;
      const { steps, state, stateChanged, title, children } = entry;
      const buttons = [
        ...(recapOf === undefined
          ? []
          : [
              iconButton('recap', 'Go to recapped slide', {
                type: 'goToSlide',
                slideIndex: recapOf,
              }),
            ]),
        ...(firstRecap === undefined
          ? []
          : [
              iconButton('recapped', 'Go to first recap', {
                type: 'goToSlide',
                slideIndex: firstRecap,
              }),
            ]),
        ...(!state
          ? []
          : stateChanged
            ? [
                iconButton(
                  'state',
                  'Reset slide',
                  { type: 'resetSlide', slideIndex },
                  true,
                ),
              ]
            : [
                iconButton('state', 'Keeps your changes', {
                  type: 'goToSlide',
                  slideIndex,
                }),
              ]),
        ...(steps
          ? [
              iconButton('steps', 'Show steps', {
                type: 'showSteps',
                slideIndex,
              }),
            ]
          : []),
      ].join('');
      return (
        row(
          level,
          [...(level === 0 ? ['open'] : []), ...(spare ? ['future'] : [])],
          { type: 'goToSlide', slideIndex },
          hasSlide && slideIndex === current ? 'page' : undefined,
          title === '' ? `Slide ${String(slideIndex + 1)}` : title,
          spare ? icon('spare', 'Spare slide') : '',
          buttons,
        ) + contentsRows(children, current, level + 1)
      );
    })
    .join('');
}

/** Returns the HTML of the table of contents, like `TocList` in the core. */
export function contentsHtml({ current, entries }: DeckContents): string {
  return entries.length === 0
    ? '<p>This deck has no table of contents.</p>'
    : contentsRows(entries, current, 0);
}

function stepClasses(
  phase: StepPhase,
  skipped: boolean,
  fallback: boolean,
): string[] {
  return [
    ...(phase === 'open' ? ['open'] : []),
    ...(phase === 'future' ? ['future'] : []),
    ...(fallback ? ['fallback'] : []),
    ...(skipped ? ['skipped'] : []),
  ];
}

function stepRow(
  { path, label, overlay, page, skipped, phase }: StepEntry,
  fallback: string,
  level: number,
): string {
  const marks = [
    ...(path.at(-1) === 0 ? [icon('initial', 'Shown up front')] : []),
    ...(overlay ? [icon('overlay', 'Covers other content')] : []),
    ...(page ? [icon('page', 'Exported as a page')] : []),
  ].join('');
  return row(
    level,
    stepClasses(phase, skipped, label === ''),
    { type: 'goToStep', path },
    phase === 'current' ? 'step' : undefined,
    label === '' ? fallback : label,
    marks,
    '',
  );
}

function stepRows(entries: readonly StepEntry[], level: number): string {
  return entries
    .map((entry) => {
      const last = entry.path.at(-1) ?? 0;
      return (
        stepRow(
          entry,
          last === 0 ? 'Start of the step' : `Step ${String(last)}`,
          level,
        ) + stepRows(entry.children, level + 1)
      );
    })
    .join('');
}

/** Returns the HTML of the steps of a slide, like `StepTree` in the core. */
export function stepsHtml({
  startPhase,
  startPage,
  entries,
}: SlideSteps): string {
  if (entries.length === 0) {
    return '<p>This slide has no steps.</p>';
  }
  const [first] = entries;
  const start =
    first?.path.length === 1 && first.path[0] === 0 ? first : undefined;
  return (
    stepRow(
      {
        path: [],
        label: start?.label ?? '',
        overlay: start?.overlay ?? false,
        page: startPage,
        skipped: false,
        phase: startPhase,
        children: [],
      },
      'Start of the slide',
      0,
    ) +
    stepRows(start?.children ?? [], 1) +
    stepRows(start === undefined ? entries : entries.slice(1), 0)
  );
}

/** Returns the HTML that asks to preview the deck, to see `what`. */
export function welcomeHtml(what: string): string {
  return `<p>Preview this deck to see ${escapeHtml(what)}.</p><button class="action" ${action({ type: 'preview' })}>Preview Deck</button>`;
}

const STYLE = `
  html, body { margin: 0; padding: 0; }
  body { color: var(--vscode-foreground); font-family: var(--vscode-font-family); font-size: var(--vscode-font-size); }
  p { margin: 0; padding: 8px 20px; }
  button { color: inherit; font: inherit; border: 0; background: none; cursor: pointer; }
  button:focus-visible { outline: 1px solid var(--vscode-focusBorder); outline-offset: -1px; }
  .row { display: flex; align-items: center; height: 22px; padding-right: 4px; }
  .row:hover { background: var(--vscode-list-hoverBackground); }
  .row.current { background: var(--vscode-list-inactiveSelectionBackground); color: var(--vscode-list-inactiveSelectionForeground); }
  .entry { display: flex; align-items: center; flex: 1; min-width: 0; height: 100%; gap: 4px; padding: 0 3px 0 calc(20px + var(--level) * 16px); text-align: left; }
  .label { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .open { font-weight: 600; }
  .future { color: var(--vscode-descriptionForeground); }
  .fallback { font-style: italic; }
  .skipped { color: var(--vscode-disabledForeground); text-decoration: line-through; }
  .icon { flex: none; width: 16px; height: 16px; fill: currentColor; opacity: 0.8; }
  .mark { position: relative; display: flex; flex: none; padding: 3px; border-radius: 5px; }
  .mark.changed::after { content: ''; position: absolute; top: 2px; right: 2px; width: 6px; height: 6px; border-radius: 50%; background: var(--vscode-notificationsInfoIcon-foreground); }
  .mark:hover { background: var(--vscode-toolbar-hoverBackground); }
  .action { display: block; box-sizing: border-box; width: calc(100% - 40px); margin: 0 20px; padding: 4px; border-radius: 2px; background: var(--vscode-button-background); color: var(--vscode-button-foreground); text-align: center; }
  .action:hover { background: var(--vscode-button-hoverBackground); }
`;

/**
 * Returns the page of a view of the sidebar, which shows the HTML it is sent,
 * keeping the focus on what it was on, and sends what the buttons say.
 */
export function sidebarHtml(nonce: string): string {
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta
      http-equiv="Content-Security-Policy"
      content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';"
    />
    <style>${STYLE}</style>
  </head>
  <body>
    <script nonce="${nonce}">
      const vscode = acquireVsCodeApi();
      document.addEventListener('click', ({ target }) => {
        const message = target.closest('[data-message]')?.dataset.message;
        if (message !== undefined) {
          vscode.postMessage(JSON.parse(message));
        }
      });
      window.addEventListener('message', ({ data: { html } }) => {
        const focused = document.activeElement?.dataset?.message;
        const content = document.getElementById('content') ?? document.body.appendChild(Object.assign(document.createElement('main'), { id: 'content' }));
        content.innerHTML = html;
        for (const button of content.querySelectorAll('[data-message]')) {
          if (button.dataset.message === focused) {
            button.focus();
          }
        }
        content.querySelector('.current')?.scrollIntoView({ block: 'nearest' });
      });
      vscode.postMessage({ type: 'ready' });
    </script>
  </body>
</html>
`;
}
