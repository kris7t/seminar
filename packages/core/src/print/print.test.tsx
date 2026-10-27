import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { useEffect, useState, type JSX } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Deck } from '../deck/Deck.tsx';
import { Slide } from '../slide/Slide.tsx';
import { slideNumberClasses } from '../slide/SlideNumber.tsx';
import { Step, stepClasses } from '../steps/Step.tsx';
import { useTransitionHold } from '../transitions/settling.ts';
import { useSlideView } from '../view/SlideViewContext.ts';
import { PAGE_ATTRIBUTE } from './PrintView.tsx';

/**
 * Returns the pages as `slide: text`, with the text of the steps shown, but
 * without the slide number.
 */
function pages(): string[] {
  return [...document.querySelectorAll(`[${PAGE_ATTRIBUTE}]`)].map((page) => {
    const shown = page.cloneNode(true) as Element;
    for (const element of shown.querySelectorAll(
      `.${stepClasses.hidden}, .${stepClasses.collapsed}, .${slideNumberClasses.root}`,
    )) {
      element.remove();
    }
    return `${page.getAttribute(PAGE_ATTRIBUTE) ?? '?'}: ${shown.textContent.trim()}`;
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
 * Prints with the dialog after choosing `choose`, and returns the pages
 * printed.
 */
async function print(
  user: ReturnType<typeof userEvent.setup>,
  choose?: () => Promise<void>,
): Promise<string[]> {
  let printed: string[] | undefined;
  vi.spyOn(window, 'print').mockImplementation(() => {
    printed = pages();
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
    expect(pages()).toEqual([]);
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
    await screen.findByText('Loading');
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
