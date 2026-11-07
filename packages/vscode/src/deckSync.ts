import {
  ColorThemeKind,
  commands,
  EventEmitter,
  Range,
  TabInputText,
  TabInputWebview,
  TextEditorRevealType,
  ThemeColor,
  Uri,
  ViewColumn,
  window,
  workspace,
  WorkspaceEdit,
  type Disposable,
  type TextDocument,
  type TextEditor,
} from 'vscode';

import { deckOfPage, isInside } from './cli.ts';
import type { DeckContents, SlideSteps } from './sidebarPage.ts';
import {
  hiddenSources,
  sourceOfStep,
  sourcesIn,
  stepOfCursor,
  stepOnSlide,
  type Placed,
} from './stepSources.ts';
import type { ChannelMessage } from './devServers.ts';
import {
  shiftRanges,
  shiftTable,
  slideAtLine,
  type SlideSource,
  type SourcePosition,
} from './slideTable.ts';
import { parseAttributeEdits, SourceEdits } from './sourceEdits.ts';

/** The version of the messages, which both sides ignore if it isn't theirs. */
const VERSION = 1;

/** How long to wait for the cursor to settle before moving the preview. */
const CURSOR_DELAY = 150;

/** How long after an edit a moving cursor only follows it, in milliseconds. */
const EDIT_TIME = 100;

/** How long to wait for what steppers tell to settle, in milliseconds. */
const DIMMING_DELAY = 80;

/** How long a new slide may still change where steps are, in milliseconds. */
const SETTLE_TIME = 1500;

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
  /** Where the steppers of each slide are, once they are probed. */
  probed: Placed[][];
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

function samePath(a: readonly number[], b: readonly number[]): boolean {
  return a.length === b.length && a.every((step, index) => step === b[index]);
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
  // As much as unused code, which the theme tells. This variable isn't an API of
  // the editor, so it has a fallback, the defaults of the editor.
  readonly #hidden = window.createTextEditorDecorationType({
    light: {
      opacity: 'var(--monaco-editor-unnecessary-decoration-opacity, 0.467)',
    },
    dark: {
      opacity: 'var(--monaco-editor-unnecessary-decoration-opacity, 0.667)',
    },
  });
  /** The attributes that previews edited since their sources were saved. */
  readonly #edits = new SourceEdits();
  readonly #changed = new EventEmitter<undefined>();
  /** Fires when what is known of the active deck may have changed. */
  readonly onDidChange = this.#changed.event;
  readonly #disposables: Disposable[];
  /** The deck that was last in front. */
  #active: string | undefined;
  /**
   * The cursor that moved a preview to another slide, whose steps may still
   * find their places, or which the probe of the slide didn't know yet, e.g.,
   * callouts pointing at parts of diagrams, which render later. Ends when the
   * presenter moves the preview, so that it isn't moved back.
   */
  #settling:
    { synced: SyncedDeck; editor: TextEditor; until: number } | undefined;
  /** Where the cursor was last. */
  #cursor: string | undefined;
  /** When a document was last edited, whose cursors just follow the edit. */
  #editedAt = 0;
  #dimmingTimer: ReturnType<typeof setTimeout> | undefined;
  #cursorTimer: ReturnType<typeof setTimeout> | undefined;
  #highlightTimer: ReturnType<typeof setTimeout> | undefined;
  #sourceHighlightTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(send: (project: string, message: ChannelMessage) => void) {
    this.#send = send;
    const activeEditor = window.activeTextEditor;
    this.#active = activeEditor && deckOfUri(activeEditor.document.uri);
    for (const document of workspace.textDocuments) {
      this.#opened(document);
    }
    this.#disposables = [
      this.#highlight,
      this.#sourceHighlight,
      this.#hidden,
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
      workspace.onDidOpenTextDocument((document) => {
        this.#opened(document);
      }),
      workspace.onDidSaveTextDocument((document) => {
        // Pages show the edits until they compile the saved deck.
        if (deckOfUri(document.uri) !== undefined) {
          this.#edits.saved(document.uri.fsPath, document.getText());
        }
      }),
      workspace.onDidCloseTextDocument((document) => {
        if (this.#edits.closed(document.uri.fsPath)) {
          this.#sendEdits(document.uri.fsPath, '');
        }
      }),
      workspace.onDidChangeTextDocument(({ document, contentChanges }) => {
        const file = document.uri.fsPath;
        const changes = contentChanges.map(({ range, text }) => ({
          startLine: range.start.line,
          startColumn: range.start.character,
          endLine: range.end.line,
          endColumn: range.end.character,
          text,
        }));
        // Saving tells that the document is no longer dirty without changes.
        // Whether it's dirty isn't known yet when it's first changed.
        if (
          deckOfUri(document.uri) !== undefined &&
          changes.length > 0 &&
          this.#edits.changed(file, changes, document.getText())
        ) {
          this.#sendEdits(file, document.getText());
        }
        const synced = this.#decks.get(file);
        if (synced !== undefined) {
          synced.table = shiftTable(synced.table, changes);
        }
        for (const [deck, deckSync] of this.#decks) {
          deckSync.probed = deckSync.probed.map((sources) => {
            const moved = new Set(sourcesIn(sources, file, deck));
            return moved.size === 0
              ? sources
              : sources.map(
                  (source) =>
                    (moved.has(source)
                      ? shiftRanges([source], changes)[0]
                      : undefined) ?? source,
                );
          });
          const { steps } = deckSync;
          if (steps !== undefined) {
            const changed = new Set(sourcesIn(steps.sources, file, deck));
            if (changed.size > 0) {
              steps.sources = steps.sources.map(
                (source) =>
                  (changed.has(source)
                    ? shiftRanges([source], changes)[0]
                    : undefined) ?? source,
              );
            }
          }
        }
        this.#editedAt = Date.now();
        clearTimeout(this.#cursorTimer);
        this.#updateDimming();
      }),
      window.onDidChangeVisibleTextEditors(() => {
        this.#updateDimming();
      }),
      window.onDidChangeActiveColorTheme(() => {
        this.#updateDimming();
      }),
      workspace.onDidChangeConfiguration((event) => {
        if (event.affectsConfiguration('seminar.preview.dimHidden')) {
          this.#updateDimming();
        }
      }),
      // Whatever moved the cursor, also other extensions, like Vim modes, except
      // for typing, which the cursor only follows. They may also tell about
      // cursors that stay, e.g., changing modes, which shouldn't move a preview
      // that was moved elsewhere.
      window.onDidChangeTextEditorSelection(({ textEditor }) => {
        const { line, character } = textEditor.selection.active;
        const cursor = `${textEditor.document.uri.fsPath}:${String(line)}:${String(character)}`;
        const moved = cursor !== this.#cursor;
        this.#cursor = cursor;
        if (
          moved &&
          textEditor === window.activeTextEditor &&
          Date.now() - this.#editedAt > EDIT_TIME
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
    clearTimeout(this.#dimmingTimer);
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
    this.#settling = undefined;
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
    this.#settling = undefined;
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
      slides?: SlideSource[] | Placed[][];
      slideIndex?: unknown;
      entries?: unknown;
      initial?: unknown;
      restored?: unknown;
      range?: PageRange;
      edits?: unknown;
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
      probed: [],
    };
    this.#decks.set(deck, synced);
    if (message.event === 'pageClosed') {
      this.#close(synced);
      this.#update();
      return;
    }
    synced.live = true;
    if (message.event === 'input') {
      if (this.#settling?.synced === synced) {
        this.#settling = undefined;
      }
    } else if (message.event === 'probe' && Array.isArray(data.slides)) {
      synced.probed = data.slides as unknown as Placed[][];
    } else if (message.event === 'goToSource') {
      this.#goToSource(deck, project, data.range).catch((error: unknown) => {
        void window.showErrorMessage(
          error instanceof Error ? error.message : String(error),
        );
      });
    } else if (message.event === 'editAttributes') {
      this.#editAttributes(deck, project, data.edits).catch(
        (error: unknown) => {
          void window.showWarningMessage(
            error instanceof Error ? error.message : String(error),
          );
        },
      );
    } else if (message.event === 'slides' && Array.isArray(data.slides)) {
      synced.table = data.slides as SlideSource[];
      // Pages only edit their decks once they know there is an editor.
      this.#sendTo(synced, 'editor', {});
      // Also when a page starts, or compiles the deck again.
      for (const file of this.#edits.files) {
        const document = workspace.textDocuments.find(
          ({ uri }) => uri.fsPath === file,
        );
        if (document !== undefined) {
          this.#sendTo(synced, 'pendingAttributes', {
            file,
            entries: this.#edits.pending(file, document.getText()),
          });
        }
      }
    } else if (message.event === 'contents' && Array.isArray(data.entries)) {
      synced.contents = data as unknown as DeckContents;
    } else if (message.event === 'steps' && Array.isArray(data.entries)) {
      this.#receiveSteps(deck, synced, data as unknown as SlideSteps);
    } else if (
      message.event === 'location' &&
      typeof data.slideIndex === 'number'
    ) {
      synced.current = data.slideIndex;
      if (data.initial !== true) {
        this.#showSlide(deck, synced);
      } else if (data.restored !== true) {
        this.#startAtCursor(deck);
      }
    }
    this.#update();
  }

  /** Starts keeping track of the changes of a deck that is saved. */
  #opened(document: TextDocument): void {
    if (deckOfUri(document.uri) !== undefined && !document.isDirty) {
      this.#edits.saved(document.uri.fsPath, document.getText());
    }
  }

  /** Tells the pages of decks the attributes edited in `file`, now `text`. */
  #sendEdits(file: string, text: string): void {
    const entries = this.#edits.pending(file, text);
    for (const synced of this.#decks.values()) {
      if (synced.live && isInside(synced.project, file)) {
        this.#sendTo(synced, 'pendingAttributes', { file, entries });
      }
    }
  }

  /**
   * Edits the attributes of directives of `deck` in `project`, or of the decks
   * it includes, as a page asks for, in the sources of the editor, and tells
   * the pages what they are now, also if they couldn't be edited.
   */
  async #editAttributes(
    deck: string,
    project: string,
    data: unknown,
  ): Promise<void> {
    const edits = parseAttributeEdits(data);
    if (edits === undefined) {
      return;
    }
    const files = new Map<string, typeof edits>();
    for (const edit of edits) {
      const file = edit.file ?? deck;
      if (!isInside(project, file)) {
        return;
      }
      files.set(file, [...(files.get(file) ?? []), edit]);
    }
    const documents: TextDocument[] = [];
    try {
      const workspaceEdit = new WorkspaceEdit();
      for (const [file, fileEdits] of files) {
        const document = await workspace.openTextDocument(Uri.file(file));
        documents.push(document);
        if (!document.isDirty) {
          this.#edits.saved(file, document.getText());
        }
        for (const { start, end, text } of this.#edits.edit(
          file,
          document.getText(),
          fileEdits,
        )) {
          workspaceEdit.replace(
            document.uri,
            new Range(document.positionAt(start), document.positionAt(end)),
            text,
          );
        }
      }
      // VS Code tells that edits without changes weren't made.
      if (
        workspaceEdit.size > 0 &&
        !(await workspace.applyEdit(workspaceEdit))
      ) {
        throw new Error('The edits of the preview could not be made');
      }
    } finally {
      for (const document of documents) {
        this.#sendEdits(document.uri.fsPath, document.getText());
      }
    }
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
    // Steppers first tell how they appear before they have their places, so
    // wait for that, or a new slide would flash.
    clearTimeout(this.#dimmingTimer);
    this.#dimmingTimer = setTimeout(() => {
      this.#updateDimming();
    }, DIMMING_DELAY);
    this.#changed.fire(undefined);
  }

  #sendTo(synced: SyncedDeck, event: string, data: object): void {
    this.#send(synced.project, {
      page: synced.page,
      event,
      data: { version: VERSION, ...data },
    });
  }

  /**
   * Moves a preview that has just started on its first slide to the cursor in
   * the editor of its deck, if any, rather than scrolling the editor to the top.
   */
  #startAtCursor(deck: string): void {
    const active = window.activeTextEditor;
    const editor =
      active?.document.uri.fsPath === deck
        ? active
        : window.visibleTextEditors.find(
            ({ document }) => document.uri.fsPath === deck,
          );
    if (editor !== undefined) {
      this.#followCursor(editor);
    }
  }

  #receiveSteps(deck: string, synced: SyncedDeck, steps: SlideSteps): void {
    const previous = synced.steps;
    synced.steps = steps;
    if (
      previous !== undefined &&
      (previous.slideIndex !== steps.slideIndex ||
        !samePath(previous.current, steps.current))
    ) {
      this.#showStep(deck, steps);
    }
    // Also after going to a step, which the slide may not have had yet.
    const settling = this.#settling;
    if (settling?.synced === synced) {
      if (Date.now() > settling.until) {
        this.#settling = undefined;
      } else {
        this.#followStep(deck, synced, settling.editor);
      }
    }
  }

  /** Scrolls to the current step, without moving the cursor or the focus. */
  #showStep(deck: string, steps: SlideSteps): void {
    const mode = syncMode(deck);
    if (mode === 'off' || mode === 'editorToPreview') {
      return;
    }
    const editor = window.visibleTextEditors.find(
      ({ document }) => document.uri.fsPath === deck,
    );
    const source =
      editor &&
      sourceOfStep(sourcesIn(steps.sources, deck, deck), steps.current);
    if (source !== undefined) {
      editor?.revealRange(
        new Range(
          source.start.line - 1,
          source.start.column - 1,
          source.end.line - 1,
          source.end.column - 1,
        ),
        TextEditorRevealType.InCenterIfOutsideViewport,
      );
    }
  }

  /**
   * Goes to the step of the stepper that the cursor is in, if it can't be read
   * now. Blank lines say nothing, even in a stepper, so that going through them
   * doesn't jump.
   */
  #followStep(deck: string, synced: SyncedDeck, editor: TextEditor): void {
    const { steps } = synced;
    const { document, selection } = editor;
    const { active } = selection;
    if (
      steps === undefined ||
      steps.slideIndex !== synced.current ||
      document.lineAt(active.line).isEmptyOrWhitespace
    ) {
      return;
    }
    const path = stepOfCursor(
      sourcesIn(steps.sources, document.uri.fsPath, deck),
      { line: active.line + 1, column: active.character + 1 },
    );
    if (path !== undefined && !samePath(path, steps.current)) {
      this.#sendTo(synced, 'goToStep', {
        slideIndex: steps.slideIndex,
        path,
      });
    }
  }

  #followCursor(editor: TextEditor): void {
    this.#settling = undefined;
    const file = editor.document.uri.fsPath;
    // The cursor may be in a deck that the deck in front includes a slide of.
    const deck = this.#decks.has(file) ? file : (this.activePath ?? file);
    const synced = this.#decks.get(deck);
    const mode = syncMode(deck);
    if (synced === undefined || mode === 'off' || mode === 'previewToEditor') {
      return;
    }
    if (deck !== file) {
      this.#followStep(deck, synced, editor);
      return;
    }
    const slideIndex = slideAtLine(
      synced.table,
      editor.selection.active.line,
      synced.current,
    );
    if (slideIndex === undefined) {
      return;
    }
    if (slideIndex === synced.current) {
      this.#followStep(deck, synced, editor);
      return;
    }
    // Nothing on another slide is in view, so go right to the step of what the
    // cursor is on, in one change, if the probe of the slide knows it.
    const { document, selection } = editor;
    const { active } = selection;
    const path = document.lineAt(active.line).isEmptyOrWhitespace
      ? undefined
      : stepOnSlide(sourcesIn(synced.probed[slideIndex] ?? [], file, deck), {
          line: active.line + 1,
          column: active.character + 1,
        });
    synced.current = slideIndex;
    this.#sendTo(synced, 'goToSlide', {
      slideId: synced.table[slideIndex]?.id,
      slideIndex,
      path,
    });
    this.#settling = { synced, editor, until: Date.now() + SETTLE_TIME };
    this.#update();
  }

  /**
   * Fades what can't be read at the current step in the editors of decks, except
   * in high contrast themes, like unused code.
   */
  #updateDimming(): void {
    const { kind } = window.activeColorTheme;
    const highContrast =
      kind === ColorThemeKind.HighContrast ||
      kind === ColorThemeKind.HighContrastLight;
    for (const editor of window.visibleTextEditors) {
      const file = editor.document.uri.fsPath;
      const dim = workspace
        .getConfiguration('seminar.preview', editor.document.uri)
        .get('dimHidden');
      editor.setDecorations(
        this.#hidden,
        dim === false || highContrast
          ? []
          : [...this.#decks].flatMap(([deck, { live, steps }]) =>
              live && steps !== undefined
                ? hiddenSources(sourcesIn(steps.sources, file, deck)).map(
                    ({ start, end }) =>
                      new Range(
                        start.line - 1,
                        start.column - 1,
                        end.line - 1,
                        end.column - 1,
                      ),
                  )
                : [],
            ),
      );
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
