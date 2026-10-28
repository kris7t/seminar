import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { useEffect, useState, type JSX } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Deck } from '../deck/Deck.tsx';
import type { SeminarHost } from '../host/SeminarHost.ts';
import { Notes } from '../notes/Notes.tsx';
import { Slide } from '../slide/Slide.tsx';
import { slideNumberClasses } from '../slide/SlideNumber.tsx';
import { Step, stepClasses } from '../steps/Step.tsx';
import { useTransitionHold } from '../transitions/settling.ts';
import { useSlideView } from '../view/SlideViewContext.ts';
import { PAGE_ATTRIBUTE, SHEET_ATTRIBUTE } from './PrintView.tsx';

/**
 * Returns a page as `slide: text`, with the text of the steps shown, but
 * without the slide number.
 */
function pageText(page: Element): string {
  const shown = page.cloneNode(true) as Element;
  for (const element of shown.querySelectorAll(
    `.${stepClasses.hidden}, .${stepClasses.collapsed}, .${slideNumberClasses.root}`,
  )) {
    element.remove();
  }
  return `${page.getAttribute(PAGE_ATTRIBUTE) ?? '?'}: ${shown.textContent.trim()}`;
}

/**
 * Returns the sheets of paper, each as its pages, separated by `|`, and the
 * rest of its text, like notes, after `+`.
 */
function sheets(): string[] {
  return [...document.querySelectorAll(`[${SHEET_ATTRIBUTE}]`)].map((sheet) => {
    const rest = sheet.cloneNode(true) as Element;
    for (const page of rest.querySelectorAll(`[${PAGE_ATTRIBUTE}]`)) {
      page.remove();
    }
    const text = rest.textContent.trim();
    return [
      [...sheet.querySelectorAll(`[${PAGE_ATTRIBUTE}]`)]
        .map(pageText)
        .join(' | '),
      ...(text === '' ? [] : [text]),
    ].join(' + ');
  });
}

/** Shows the text of the steps that aren't hidden. */
function Shown({ children }: { children: string }) {
  return <Step only>{children}</Step>;
}

function renderDeck(extra?: JSX.Element) {
  return render(
    <Deck>
      <Slide title="First">
        <Shown>A</Shown>
        <Shown>B</Shown>
        <Notes>Say hello.</Notes>
      </Slide>
      <Slide title="Second">
        <Step>C</Step>
        <Step>D</Step>
      </Slide>
      <Slide title="Spare" spare />
      {extra}
    </Deck>,
  );
}

/**
 * Prints with the dialog after choosing `choose`, and returns the sheets
 * printed (see {@link sheets}).
 */
async function print(
  user: ReturnType<typeof userEvent.setup>,
  choose?: () => Promise<void>,
): Promise<string[]> {
  let printed: string[] | undefined;
  vi.spyOn(window, 'print').mockImplementation(() => {
    // Nothing shows that the pages are being prepared behind the dialog of
    // the browser.
    expect(screen.queryByRole('progressbar')).toBeNull();
    printed = sheets();
  });
  await user.keyboard('{Control>}p{/Control}');
  await screen.findByRole('dialog');
  await choose?.();
  await user.click(screen.getByRole('button', { name: 'Print' }));
  await waitFor(() => {
    expect(printed).toBeDefined();
  });
  return printed ?? [];
}

describe('printing', () => {
  beforeEach(() => {
    window.history.replaceState(null, '', '#');
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('prints the slides split into pages', async () => {
    const user = userEvent.setup();
    renderDeck();
    expect(await print(user)).toEqual([
      '1: FirstA',
      '1: FirstB',
      '2: SecondCD',
    ]);
    // The pages and the dialog are gone once the browser has printed them.
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
    });
    expect(sheets()).toEqual([]);
  });

  it('prints every step, and spare slides', async () => {
    const user = userEvent.setup();
    renderDeck();
    expect(
      await print(user, async () => {
        await user.click(screen.getByRole('radio', { name: /every step/ }));
        await user.click(
          screen.getByRole('checkbox', { name: 'Include spare slides' }),
        );
      }),
    ).toEqual([
      '1: First',
      '1: FirstA',
      '1: FirstB',
      '2: Second',
      '2: SecondC',
      '2: SecondCD',
      '3: Spare',
    ]);
  });

  it('prints the slides with their notes', async () => {
    const user = userEvent.setup();
    renderDeck();
    expect(
      await print(user, async () => {
        await user.click(
          screen.getByRole('radio', { name: 'Slide with notes' }),
        );
      }),
    ).toEqual([
      '1: FirstA',
      // The notes come after the last page of the slide.
      '1: FirstB + Say hello.',
      '2: SecondCD',
    ]);
  });

  it('prints several slides on each sheet', async () => {
    const user = userEvent.setup();
    renderDeck();
    expect(
      await print(user, async () => {
        await user.click(
          screen.getByRole('radio', { name: 'Several slides per sheet' }),
        );
        await user.click(
          screen.getByRole('combobox', { name: 'Slides per sheet' }),
        );
        await user.click(screen.getByRole('option', { name: '2' }));
        await user.click(screen.getByRole('radio', { name: /every step/ }));
      }),
    ).toEqual([
      '1: First | 1: FirstA',
      '1: FirstB | 2: Second',
      '2: SecondC | 2: SecondCD',
    ]);
  });

  it('lays out slides whose steps change once they are shown', async () => {
    const user = userEvent.setup();
    // Like diagrams, whose items get their steps once they are rendered.
    function Later() {
      const [shown, setShown] = useState(false);
      useEffect(() => {
        const timeout = setTimeout(() => {
          setShown(true);
        }, 0);
        return () => {
          clearTimeout(timeout);
        };
      }, []);
      return shown ? (
        <>
          <Shown>E</Shown>
          <Shown>F</Shown>
        </>
      ) : null;
    }
    renderDeck(
      <Slide title="Fourth">
        <Later />
      </Slide>,
    );
    expect(
      await print(user, async () => {
        await user.click(
          screen.getByRole('radio', { name: 'Several slides per sheet' }),
        );
        await user.click(
          screen.getByRole('combobox', { name: 'Slides per sheet' }),
        );
        await user.click(screen.getByRole('option', { name: '2' }));
      }),
    ).toEqual([
      '1: FirstA | 1: FirstB',
      '2: SecondCD | 4: FourthE',
      '4: FourthF',
    ]);
  });

  it('leaves out the header and footer of the browser', async () => {
    const user = userEvent.setup();
    let styles = '';
    vi.spyOn(window, 'print').mockImplementation(() => {
      styles = [...document.querySelectorAll('style')]
        .map((style) => style.textContent)
        .join('');
    });
    renderDeck();
    await user.keyboard('{Control>}p{/Control}');
    await user.click(
      await screen.findByRole('radio', { name: 'Slide with notes' }),
    );
    await user.click(
      screen.getByRole('checkbox', { name: 'Headers and footers' }),
    );
    await user.click(screen.getByRole('button', { name: 'Print' }));
    await waitFor(() => {
      expect(styles).not.toBe('');
    });
    expect(styles).toMatch(/@top-left\s*\{\s*content:\s*""/);
    expect(styles).toMatch(/@bottom-left\s*\{\s*content:\s*""/);
  });

  it('prints headers with the metadata of the deck', async () => {
    const user = userEvent.setup();
    let styles = '';
    vi.spyOn(window, 'print').mockImplementation(() => {
      styles = [...document.querySelectorAll('style')]
        .map((style) => style.textContent)
        .join('');
    });
    render(
      <Deck
        metadata={{
          title: 'Engines "and" more',
          authors: ['Ada Lovelace', 'Charles Babbage'],
          event: 'Royal Society',
        }}
      >
        <Slide title="First" />
      </Deck>,
    );
    await user.keyboard('{Control>}p{/Control}');
    const headers = await screen.findByRole('checkbox', {
      name: 'Headers and footers',
    });
    // Slides take the whole sheet, without headers.
    expect(headers).toHaveProperty('disabled', true);
    expect(headers).toHaveProperty('checked', false);
    await user.click(screen.getByRole('radio', { name: 'Slide with notes' }));
    expect(headers).toHaveProperty('disabled', false);
    expect(headers).toHaveProperty('checked', true);
    await user.click(screen.getByRole('button', { name: 'Print' }));
    await waitFor(() => {
      expect(styles).not.toBe('');
    });
    expect(styles).toMatch(
      /@top-left\s*\{\s*content:\s*"Engines \\"and\\" more"/,
    );
    expect(styles).toMatch(
      /@top-right\s*\{\s*content:\s*"Ada Lovelace, Charles Babbage · Royal Society"/,
    );
    expect(styles).toMatch(
      /@bottom-center\s*\{\s*content:\s*counter\(page\) " \/ " counter\(pages\)/,
    );
  });

  it('prints for the application that shows the deck', async () => {
    const print = vi.spyOn(window, 'print').mockImplementation(() => {
      // Never prints itself.
    });
    let printed: string[] | undefined;
    const host: SeminarHost = {
      print: {
        pages: 'split',
        spares: false,
        layout: 'notes',
        perSheet: 4,
        headers: true,
      },
      printReady: () => {
        printed = sheets();
      },
    };
    Object.assign(window, { seminarHost: host });
    try {
      renderDeck();
      await waitFor(() => {
        expect(printed).toBeDefined();
      });
    } finally {
      delete (window as { seminarHost?: SeminarHost }).seminarHost;
    }
    expect(printed).toEqual([
      '1: FirstA',
      '1: FirstB + Say hello.',
      '2: SecondCD',
    ]);
    expect(print).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('is in the menu', async () => {
    const user = userEvent.setup();
    renderDeck();
    await user.click(screen.getByRole('button', { name: 'Menu' }));
    await user.click(await screen.findByRole('menuitem', { name: /Print…/ }));
    expect(await screen.findByRole('dialog', { name: 'Print' })).toBeDefined();
  });

  it('waits for the pages to be ready', async () => {
    const user = userEvent.setup();
    const loaded = new EventTarget();
    function Loading() {
      const { kind } = useSlideView();
      const [pending, setPending] = useState(kind === 'print');
      useEffect(() => {
        const onLoad = () => {
          setPending(false);
        };
        loaded.addEventListener('load', onLoad);
        return () => {
          loaded.removeEventListener('load', onLoad);
        };
      }, []);
      useTransitionHold(pending);
      return <p>{pending ? 'Loading' : 'Loaded'}</p>;
    }
    renderDeck(
      <Slide title="Fourth">
        <Loading />
      </Slide>,
    );
    let printed = false;
    const printing = print(user).finally(() => {
      printed = true;
    });
    await screen.findAllByText('Loading');
    await new Promise((resolve) => {
      setTimeout(resolve, 300);
    });
    expect(printed).toBe(false);
    act(() => {
      loaded.dispatchEvent(new Event('load'));
    });
    expect((await printing).at(-1)).toBe('4: FourthLoaded');
  });
});
