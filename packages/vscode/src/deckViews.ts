import { randomBytes } from 'node:crypto';
import {
  commands,
  window,
  type Disposable,
  type Webview,
  type WebviewView,
} from 'vscode';

import type { DeckSync, SyncedDeck } from './deckSync.ts';
import {
  contentsHtml,
  sidebarHtml,
  stepsHtml,
  welcomeHtml,
  type SidebarMessage,
} from './sidebarPage.ts';

/** A view of the sidebar, which shows what `render` returns. */
class SidebarView {
  readonly #render: () => string;
  readonly #onMessage: (message: SidebarMessage) => void;
  #webview: Webview | undefined;
  #shown: string | undefined;

  constructor(
    render: () => string,
    onMessage: (message: SidebarMessage) => void,
  ) {
    this.#render = render;
    this.#onMessage = onMessage;
  }

  resolveWebviewView(view: WebviewView): void {
    const { webview } = view;
    this.#webview = webview;
    this.#shown = undefined;
    webview.options = { enableScripts: true };
    webview.onDidReceiveMessage((message: SidebarMessage) => {
      if (message.type === 'ready') {
        this.#shown = undefined;
        this.update();
      } else {
        this.#onMessage(message);
      }
    });
    view.onDidDispose(() => {
      this.#webview = undefined;
    });
    webview.html = sidebarHtml(randomBytes(16).toString('hex'));
  }

  update(): void {
    const html = this.#render();
    if (html !== this.#shown) {
      this.#shown = html;
      void this.#webview?.postMessage({ html });
    }
  }
}

/** The views of the sidebar of decks: their contents and steps. */
export class DeckViews implements Disposable {
  readonly #disposables: Disposable[];

  constructor(sync: DeckSync) {
    const live = (): SyncedDeck | undefined => {
      const active = sync.activeDeck;
      return active?.live === true ? active : undefined;
    };
    const onMessage = (message: SidebarMessage) => {
      switch (message.type) {
        case 'preview':
          void commands.executeCommand('seminar.preview');
          break;
        case 'goToSlide':
          sync.goToSlide(message.slideIndex);
          break;
        case 'showSteps':
          sync.goToSlide(message.slideIndex);
          void commands.executeCommand('seminar.steps.focus');
          break;
        case 'resetSlide':
          sync.resetSlide(message.slideIndex);
          break;
        case 'goToStep':
          sync.goToStep(message.path);
          break;
        case 'ready':
          break;
      }
    };
    const contents = new SidebarView(() => {
      const known = live()?.contents;
      return known === undefined
        ? welcomeHtml('its table of contents')
        : contentsHtml(known);
    }, onMessage);
    const steps = new SidebarView(() => {
      const known = live()?.steps;
      return known === undefined
        ? welcomeHtml('the steps of its slide')
        : stepsHtml(known);
    }, onMessage);
    this.#disposables = [
      window.registerWebviewViewProvider('seminar.contents', contents, {
        webviewOptions: { retainContextWhenHidden: true },
      }),
      window.registerWebviewViewProvider('seminar.steps', steps, {
        webviewOptions: { retainContextWhenHidden: true },
      }),
      sync.onDidChange(() => {
        contents.update();
        steps.update();
      }),
    ];
  }

  dispose(): void {
    for (const disposable of this.#disposables) {
      disposable.dispose();
    }
  }
}
