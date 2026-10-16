import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { Deck } from '../deck/Deck.tsx';
import { Slide } from '../slide/Slide.tsx';
import { Step } from '../steps/Step.tsx';
import de from './locales/de.json' with { type: 'json' };
import en from './locales/en.json' with { type: 'json' };
import fr from './locales/fr.json' with { type: 'json' };
import hu from './locales/hu.json' with { type: 'json' };
import GERMAN from './locales/de.ts';
import HUNGARIAN from './locales/hu.ts';
import {
  createTranslate,
  ENGLISH,
  findLocale,
  formatShortcut,
} from './messages.ts';

describe('catalogs', () => {
  it.each([
    ['hu', hu],
    ['de', de],
    ['fr', fr],
  ])('translates every message to %s', (_, catalog) => {
    expect(Object.keys(catalog).sort()).toEqual(Object.keys(en).sort());
    // With the same values interpolated.
    for (const [key, message] of Object.entries(en)) {
      const names = (text: string) =>
        [...text.matchAll(/\{\{(\w+)\}\}/gu)].map(([, name]) => name).sort();
      expect(
        names((catalog as Record<string, string>)[key] ?? ''),
        key,
      ).toEqual(names(message));
    }
  });
});

describe('createTranslate', () => {
  it('interpolates values and falls back to English', () => {
    const t = createTranslate({
      lang: 'hu',
      catalog: { slide: '{{number}}. dia' },
    });
    expect(t('slide', { number: 3 })).toBe('3. dia');
    expect(t('nextStep')).toBe('Next step');
  });

  it('chooses plural forms', () => {
    const t = createTranslate({
      lang: 'en',
      catalog: { step_one: 'one step', step_other: '{{count}} steps' },
    });
    expect(t('step', { count: 1 })).toBe('one step');
    expect(t('step', { count: 2 })).toBe('2 steps');
  });

  it('names keys in the language', () => {
    expect(formatShortcut(createTranslate(GERMAN), 'Shift+Home')).toBe(
      'Umschalt+Pos1',
    );
    expect(formatShortcut(createTranslate(ENGLISH), 'Shift+T')).toBe('Shift+T');
  });

  it('finds locales by their base language', () => {
    expect(findLocale([ENGLISH, HUNGARIAN], 'hu-HU')).toBe(HUNGARIAN);
    expect(findLocale([ENGLISH], 'de')).toBeUndefined();
  });
});

describe('the language of a deck', () => {
  beforeEach(() => {
    window.history.replaceState(null, '', '#');
    localStorage.clear();
  });

  afterEach(() => {
    cleanup();
  });

  async function openMenu(user: ReturnType<typeof userEvent.setup>) {
    await user.pointer({
      keys: '[MouseRight]',
      target: screen.getByRole('heading'),
    });
    return screen.findByRole('menu');
  }

  it('shows the user interface in the language of the deck', async () => {
    const user = userEvent.setup();
    render(
      <Deck lang="hu" uiLocales={[HUNGARIAN]}>
        <Slide title="Első" />
        <Slide title="Second" lang="en" />
      </Deck>,
    );
    expect(
      screen.getByRole('heading').closest('[lang]')?.getAttribute('lang'),
    ).toBe('hu');
    const menu = await openMenu(user);
    expect(within(menu).getByText('Következő dia')).toBeDefined();
    // No choice of languages with only one.
    expect(within(menu).queryByText('Magyar')).toBeNull();
    expect(menu.closest('[lang]')?.getAttribute('lang')).toBe('hu');
  });

  it('switches the language of the user interface', async () => {
    const user = userEvent.setup();
    render(
      <Deck lang="hu" uiLocales={[HUNGARIAN, ENGLISH]}>
        <Slide title="Első" />
      </Deck>,
    );
    // The browser prefers English, which the deck offers, too.
    let menu = await openMenu(user);
    expect(within(menu).getByText('Next slide')).toBeDefined();
    // The current language is shown in the menu, and chosen from its own.
    await user.click(
      within(menu).getByRole('menuitem', { name: 'Language English' }),
    );
    const languages = await screen.findByRole('menu', { name: 'Language' });
    await user.click(within(languages).getByText('Magyar'));
    await waitFor(() => {
      expect(screen.queryByRole('menu')).toBeNull();
    });
    menu = await openMenu(user);
    expect(within(menu).getByText('Következő dia')).toBeDefined();
    expect(
      within(menu).getByRole('menuitem', { name: 'Nyelv Magyar' }),
    ).toBeDefined();
    await user.keyboard('{Escape}');
    await waitFor(() => {
      expect(screen.queryByRole('menu')).toBeNull();
    });
    // The slides stay in their language.
    expect(
      screen.getByRole('heading').closest('[lang]')?.getAttribute('lang'),
    ).toBe('hu');
    // The choice is remembered.
    cleanup();
    render(
      <Deck lang="hu" uiLocales={[HUNGARIAN, ENGLISH]}>
        <Slide title="Első" />
      </Deck>,
    );
    menu = await openMenu(user);
    expect(within(menu).getByText('Következő dia')).toBeDefined();
  });

  it('tells the languages of the text of the slides in the sidebar', () => {
    render(
      <Deck
        lang="hu"
        uiLocales={[ENGLISH]}
        toc={[{ slide: 0 }, { slide: 1 }, { slide: 2 }]}
        defaultShowToc
        defaultShowSteps
      >
        <Slide title="Első">
          <Step>Lépés</Step>
        </Slide>
        <Slide title="Second" lang="en" />
        <Slide />
      </Deck>,
    );
    const langOf = (text: string) =>
      within(screen.getByRole('navigation', { name: 'Table of contents' }))
        .getByText(text)
        .closest('[lang]')
        ?.getAttribute('lang');
    expect(langOf('Első')).toBe('hu');
    expect(langOf('Second')).toBe('en');
    // Not the title that stands in for a slide without one.
    expect(langOf('Slide 3')).toBe('en');
    const steps = screen.getByRole('navigation', { name: 'Steps' });
    expect(
      within(steps).getByText('Lépés').closest('[lang]')?.getAttribute('lang'),
    ).toBe('hu');
  });

  it('tells the languages of the headings of the overview', async () => {
    const user = userEvent.setup();
    render(
      <Deck
        lang="hu"
        uiLocales={[ENGLISH]}
        toc={[
          { slide: 0, children: [{ slide: 1 }] },
          { title: 'Rész', children: [{ slide: 2 }] },
        ]}
      >
        <Slide title="Teil" lang="de" />
        <Slide title="A" />
        <Slide title="B" />
      </Deck>,
    );
    await user.keyboard('o');
    const overview = screen.getByRole('region', { name: 'Slide overview' });
    const langOf = (name: string) =>
      within(overview)
        .getByRole('heading', { name, level: 2 })
        .querySelector('[lang]')
        ?.getAttribute('lang');
    expect(langOf('Teil')).toBe('de');
    expect(langOf('Rész')).toBe('hu');
  });
});
