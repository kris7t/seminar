import {
  Range,
  TextEditorRevealType,
  TextEditorSelectionChangeKind,
  ThemeColor,
  Uri,
  window,
  workspace,
  type Disposable,
  type TextEditor,
} from 'vscode';

import { deckOfPage } from './cli.ts';
import type { ChannelMessage } from './devServers.ts';
import { shiftTable, slideAtLine, type SlideSource } from './slideTable.ts';

/** The version of the messages, which both sides ignore if it isn't theirs. */
const VERSION = 1;

/** How long to wait for the cursor to settle before moving the preview. */
const CURSOR_DELAY = 150;

/** How long the start of the shown slide stays highlighted. */
const HIGHLIGHT_TIME = 1000;

/** What is known of the previews of a deck. */
interface SyncedDeck {
  project: string;
  page: string;
  table: SlideSource[];
  /** The slide that the previews show, if known. */
  current: number | undefined;
}

function syncMode(deck: string): string | undefined {
  return workspace
    .getConfiguration('seminar.preview', Uri.file(deck))
    .get('sync');
}

/** Keeps the cursor in the editor of a deck and its previews together. */
export class DeckSync implements Disposable {
  readonly #send: (project: string, message: ChannelMessage) => void;
  readonly #decks = new Map<string, SyncedDeck>();
  readonly #highlight = window.createTextEditorDecorationType({
    isWholeLine: true,
    backgroundColor: new ThemeColor('editor.findMatchHighlightBackground'),
  });
  readonly #disposables: Disposable[];
  #cursorTimer: ReturnType<typeof setTimeout> | undefined;
  #highlightTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(send: (project: string, message: ChannelMessage) => void) {
    this.#send = send;
    this.#disposables = [
      this.#highlight,
      workspace.onDidChangeTextDocument(({ document, contentChanges }) => {
        const synced = this.#decks.get(document.uri.fsPath);
        if (synced !== undefined) {
          synced.table = shiftTable(
            synced.table,
            contentChanges.map(({ range, text }) => ({
              startLine: range.start.line,
              endLine: range.end.line,
              endColumn: range.end.character,
              text,
            })),
          );
        }
      }),
      window.onDidChangeTextEditorSelection(({ textEditor, kind }) => {
        if (
          kind === TextEditorSelectionChangeKind.Keyboard ||
          kind === TextEditorSelectionChangeKind.Mouse
        ) {
          clearTimeout(this.#cursorTimer);
          this.#cursorTimer = setTimeout(() => {
            this.#followCursor(textEditor);
          }, CURSOR_DELAY);
        }
      }),
    ];
  }

  dispose(): void {
    clearTimeout(this.#cursorTimer);
    clearTimeout(this.#highlightTimer);
    for (const disposable of this.#disposables) {
      disposable.dispose();
    }
  }

  /** Handles what a page of the dev server in `root` of `project` sends. */
  receive(project: string, root: string, message: ChannelMessage): void {
    const deck = deckOfPage(root, message.page);
    const data = message.data as {
      version?: unknown;
      slides?: SlideSource[];
      slideIndex?: unknown;
    } | null;
    if (deck === undefined || data?.version !== VERSION) {
      return;
    }
    const synced = this.#decks.get(deck) ?? {
      project,
      page: message.page,
      table: [],
      current: undefined,
    };
    this.#decks.set(deck, synced);
    if (message.event === 'slides' && Array.isArray(data.slides)) {
      synced.table = data.slides;
    } else if (
      message.event === 'location' &&
      typeof data.slideIndex === 'number'
    ) {
      synced.current = data.slideIndex;
      this.#showSlide(deck, synced);
    }
  }

  #followCursor(editor: TextEditor): void {
    const deck = editor.document.uri.fsPath;
    const synced = this.#decks.get(deck);
    const mode = syncMode(deck);
    if (synced === undefined || mode === 'off' || mode === 'previewToEditor') {
      return;
    }
    const slideIndex = slideAtLine(
      synced.table,
      editor.selection.active.line,
      synced.current,
    );
    if (slideIndex !== undefined && slideIndex !== synced.current) {
      synced.current = slideIndex;
      this.#send(synced.project, {
        page: synced.page,
        event: 'goToSlide',
        data: {
          version: VERSION,
          slideId: synced.table[slideIndex]?.id,
          slideIndex,
        },
      });
    }
  }

  /** Scrolls to the shown slide, without moving the cursor or the focus. */
  #showSlide(deck: string, synced: SyncedDeck): void {
    const mode = syncMode(deck);
    const editor = window.visibleTextEditors.find(
      ({ document }) => document.uri.fsPath === deck,
    );
    const { current } = synced;
    const start =
      current === undefined ? undefined : synced.table[current]?.start;
    if (
      editor === undefined ||
      start === undefined ||
      mode === 'off' ||
      mode === 'editorToPreview' ||
      slideAtLine(synced.table, editor.selection.active.line, current) ===
        current
    ) {
      return;
    }
    const range = new Range(start.line - 1, 0, start.line - 1, 0);
    editor.revealRange(range, TextEditorRevealType.InCenterIfOutsideViewport);
    editor.setDecorations(this.#highlight, [range]);
    clearTimeout(this.#highlightTimer);
    this.#highlightTimer = setTimeout(() => {
      editor.setDecorations(this.#highlight, []);
    }, HIGHLIGHT_TIME);
  }
}
