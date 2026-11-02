import {
  commands,
  EventEmitter,
  Range,
  TabInputText,
  TabInputWebview,
  TextEditorRevealType,
  TextEditorSelectionChangeKind,
  ThemeColor,
  Uri,
  ViewColumn,
  window,
  workspace,
  type Disposable,
  type TextEditor,
} from 'vscode';

import { deckOfPage, isInside } from './cli.ts';
import type { DeckContents, SlideSteps } from './sidebarPage.ts';
import type { ChannelMessage } from './devServers.ts';
import {
  shiftTable,
  slideAtLine,
  type SlideSource,
  type SourcePosition,
} from './slideTable.ts';

/** The version of the messages, which both sides ignore if it isn't theirs. */
const VERSION = 1;

/** How long to wait for the cursor to settle before moving the preview. */
const CURSOR_DELAY = 150;

/** How long the start of the shown slide stays highlighted. */
const HIGHLIGHT_TIME = 1000;

/** How long the element that was clicked on stays highlighted. */
const SOURCE_HIGHLIGHT_TIME = 2000;

/** The view type of preview panels, which tabs have with a prefix. */
export const PREVIEW_VIEW_TYPE = 'seminar.preview';

/** What is known of the previews of a deck. */
export interface SyncedDeck {
  project: string;
  page: string;
  /** Whether a preview of the deck is open. */
  live: boolean;
  table: SlideSource[];
  /** The slide that the previews show, if known. */
  current: number | undefined;
  contents: DeckContents | undefined;
  steps: SlideSteps | undefined;
}

/** Where a clicked element is, as a page tells it, from 1. */
interface PageRange {
  start: SourcePosition;
  end: SourcePosition;
  file?: string;
}

/** Returns the path of the deck at `uri`, if it's a deck. */
export function deckOfUri(uri: Uri): string | undefined {
  return uri.scheme === 'file' && uri.fsPath.endsWith('.deck.mdx')
    ? uri.fsPath
    : undefined;
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
  // Only what the element is, to compare it with what the slide shows.
  readonly #sourceHighlight = window.createTextEditorDecorationType({
    backgroundColor: new ThemeColor('editor.findMatchHighlightBackground'),
  });
  readonly #changed = new EventEmitter<undefined>();
  /** Fires when what is known of the active deck may have changed. */
  readonly onDidChange = this.#changed.event;
  readonly #disposables: Disposable[];
  /** The deck that was last in front. */
  #active: string | undefined;
  #cursorTimer: ReturnType<typeof setTimeout> | undefined;
  #highlightTimer: ReturnType<typeof setTimeout> | undefined;
  #sourceHighlightTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(send: (project: string, message: ChannelMessage) => void) {
    this.#send = send;
    const activeEditor = window.activeTextEditor;
    this.#active = activeEditor && deckOfUri(activeEditor.document.uri);
    this.#disposables = [
      this.#highlight,
      this.#sourceHighlight,
      this.#changed,
      window.onDidChangeActiveTextEditor((editor) => {
        const deck = editor && deckOfUri(editor.document.uri);
        if (deck !== undefined) {
          this.setActive(deck);
        }
      }),
      window.tabGroups.onDidChangeTabs(() => {
        this.#update();
      }),
      workspace.onDidChangeTextDocument(({ document, contentChanges }) => {
        const synced = this.#decks.get(document.uri.fsPath);
        if (synced !== undefined) {
          synced.table = shiftTable(
            synced.table,
            contentChanges.map(({ range, text }) => ({
              startLine: range.start.line,
              startColumn: range.start.character,
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
    this.#update();
  }

  dispose(): void {
    clearTimeout(this.#cursorTimer);
    clearTimeout(this.#highlightTimer);
    clearTimeout(this.#sourceHighlightTimer);
    for (const disposable of this.#disposables) {
      disposable.dispose();
    }
  }

  /** The path of the deck that the sidebar shows, if any. */
  get activePath(): string | undefined {
    const decks = this.#openDecks();
    if (this.#active !== undefined && decks.has(this.#active)) {
      return this.#active;
    }
    const [first] = decks;
    return first;
  }

  /** What is known of the previews of the deck that the sidebar shows. */
  get activeDeck(): SyncedDeck | undefined {
    const path = this.activePath;
    return path === undefined ? undefined : this.#decks.get(path);
  }

  /** Makes `deck` the one in front. */
  setActive(deck: string): void {
    this.#active = deck;
    this.#update();
  }

  /** Forgets the previews in `project`, whose dev server has stopped. */
  serverStopped(project: string): void {
    for (const synced of this.#decks.values()) {
      if (synced.project === project) {
        this.#close(synced);
      }
    }
    this.#update();
  }

  /** Moves the previews of the active deck to a slide. */
  goToSlide(slideIndex: number): void {
    const deck = this.activePath;
    const synced = this.activeDeck;
    if (deck !== undefined && synced !== undefined) {
      synced.current = slideIndex;
      this.#sendTo(synced, 'goToSlide', {
        slideId: synced.table[slideIndex]?.id,
        slideIndex,
      });
      // The page doesn't tell about moves that it was asked for.
      this.#showSlide(deck, synced);
      this.#update();
    }
  }

  /** Moves the previews of the active deck to a step of their slide. */
  goToStep(path: readonly number[]): void {
    const synced = this.activeDeck;
    if (synced?.steps !== undefined) {
      this.#sendTo(synced, 'goToStep', {
        slideIndex: synced.steps.slideIndex,
        path,
      });
    }
  }

  /** Resets the state of a slide in the previews of the active deck. */
  resetSlide(slideIndex: number): void {
    const synced = this.activeDeck;
    if (synced !== undefined) {
      this.#sendTo(synced, 'resetSlide', { slideIndex });
    }
  }

  /** Handles what a page of the dev server in `root` of `project` sends. */
  receive(project: string, root: string, message: ChannelMessage): void {
    const deck = deckOfPage(root, message.page);
    const data = message.data as {
      version?: unknown;
      slides?: SlideSource[];
      slideIndex?: unknown;
      entries?: unknown;
      range?: PageRange;
    } | null;
    if (deck === undefined || data?.version !== VERSION) {
      return;
    }
    const synced: SyncedDeck = this.#decks.get(deck) ?? {
      project,
      page: message.page,
      live: true,
      table: [],
      current: undefined,
      contents: undefined,
      steps: undefined,
    };
    this.#decks.set(deck, synced);
    if (message.event === 'pageClosed') {
      this.#close(synced);
      this.#update();
      return;
    }
    synced.live = true;
    if (message.event === 'goToSource') {
      this.#goToSource(deck, project, data.range).catch((error: unknown) => {
        void window.showErrorMessage(
          error instanceof Error ? error.message : String(error),
        );
      });
    } else if (message.event === 'slides' && Array.isArray(data.slides)) {
      synced.table = data.slides;
    } else if (message.event === 'contents' && Array.isArray(data.entries)) {
      synced.contents = data as unknown as DeckContents;
    } else if (message.event === 'steps' && Array.isArray(data.entries)) {
      synced.steps = data as unknown as SlideSteps;
    } else if (
      message.event === 'location' &&
      typeof data.slideIndex === 'number'
    ) {
      synced.current = data.slideIndex;
      this.#showSlide(deck, synced);
    }
    this.#update();
  }

  #close(synced: SyncedDeck): void {
    synced.live = false;
    synced.contents = undefined;
    synced.steps = undefined;
  }

  /** Returns the decks with an open tab or preview. */
  #openDecks(): Set<string> {
    const decks = new Set<string>();
    for (const { tabs } of window.tabGroups.all) {
      for (const { input } of tabs) {
        const deck = input instanceof TabInputText && deckOfUri(input.uri);
        if (deck) {
          decks.add(deck);
        }
      }
    }
    for (const [deck, { live }] of this.#decks) {
      if (live) {
        decks.add(deck);
      }
    }
    return decks;
  }

  /** Whether the tab of a preview panel is open, also if it wasn't restored. */
  #hasPreviewTab(): boolean {
    return window.tabGroups.all.some(({ tabs }) =>
      tabs.some(
        ({ input }) =>
          input instanceof TabInputWebview &&
          input.viewType.includes(PREVIEW_VIEW_TYPE),
      ),
    );
  }

  #update(): void {
    void commands.executeCommand(
      'setContext',
      'seminar.deckOpen',
      this.activePath !== undefined || this.#hasPreviewTab(),
    );
    this.#changed.fire(undefined);
  }

  #sendTo(synced: SyncedDeck, event: string, data: object): void {
    this.#send(synced.project, {
      page: synced.page,
      event,
      data: { version: VERSION, ...data },
    });
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
      this.#sendTo(synced, 'goToSlide', {
        slideId: synced.table[slideIndex]?.id,
        slideIndex,
      });
      this.#update();
    }
  }

  /**
   * Shows where a clicked element of `deck` is in its source, or in the deck in
   * `project` that it was included from.
   */
  async #goToSource(
    deck: string,
    project: string,
    range: PageRange | undefined,
  ): Promise<void> {
    const file = range?.file ?? deck;
    if (range === undefined || !isInside(project, file)) {
      return;
    }
    const uri = Uri.file(file);
    const document = await workspace.openTextDocument(uri);
    const shown = window.visibleTextEditors.find(
      (editor) => editor.document.uri.fsPath === file,
    );
    const target = new Range(
      range.start.line - 1,
      range.start.column - 1,
      range.end.line - 1,
      range.end.column - 1,
    );
    const editor = await window.showTextDocument(document, {
      viewColumn: shown?.viewColumn ?? ViewColumn.One,
      selection: new Range(target.start, target.start),
    });
    editor.revealRange(target, TextEditorRevealType.InCenterIfOutsideViewport);
    editor.setDecorations(this.#sourceHighlight, [target]);
    clearTimeout(this.#sourceHighlightTimer);
    this.#sourceHighlightTimer = setTimeout(() => {
      editor.setDecorations(this.#sourceHighlight, []);
    }, SOURCE_HIGHLIGHT_TIME);
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
      // Already there, unless the editor has scrolled away from the cursor.
      (slideAtLine(synced.table, editor.selection.active.line, current) ===
        current &&
        editor.visibleRanges.some((visible) =>
          visible.contains(editor.selection.active),
        ))
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
