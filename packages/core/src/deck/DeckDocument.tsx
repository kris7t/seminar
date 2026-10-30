import { ThemeProvider } from '@mui/material';
import {
  Children,
  createContext,
  isValidElement,
  useId,
  useMemo,
  useState,
  type Context,
  type JSX,
  type ReactNode,
} from 'react';

import {
  createTranslate,
  ENGLISH,
  findLocale,
  type Translate,
} from '../i18n/messages.ts';
import { UiLanguageContext } from '../i18n/UiLanguageContext.ts';
import { DocumentSlideContext } from '../masters/DocumentMasters.tsx';
import { getSlideNotes } from '../notes/Notes.tsx';
import { Slide, type SlideProps } from '../slide/Slide.tsx';
import { SharedWorkProvider } from '../shared/SharedWorkProvider.tsx';
import {
  createStateStores,
  StateStoresContext,
} from '../state/StateStoresContext.ts';
import { StepStore } from '../steps/StepStore.ts';
import { StepStoreContext } from '../steps/StepStoreContext.ts';
import { defaultSlideTheme } from '../theme/createSlideTheme.ts';
import { SlideViewProvider } from '../view/SlideViewProvider.tsx';
import type { DeckProps } from './Deck.tsx';
import { DeckContext, type DeckState } from './DeckContext.ts';
import { formatLocation } from './location.ts';
import { SeminarOptionsContext } from './SeminarOptionsContext.ts';
import { getAliases, resolveRecaps } from './recaps.ts';
import { resolveToc } from './tableOfContents.ts';

/** Whether the decks inside render as documents, see {@link DeckDocument}. */
export const DeckDocumentContext: Context<boolean> = createContext(false);

export interface DeckDocumentProps {
  /** Elements that render a {@link Deck}, e.g., the component of an MDX deck. */
  children?: ReactNode;
}

/**
 * Renders the decks inside as static documents instead, e.g., on the server
 * into the page of a deck for clients that don't run JavaScript, like text
 * extractors.
 *
 * The slides are rendered in `document` views (see `SlideViewKind`), one after
 * the other, each in a `section` that starts with a heading by the level of
 * its master: `h1` for the title, `h2` for sections, `h3` for subsections, and
 * `h4` for every other slide. The heading has the location hash of the slide
 * as its id, and links to it, so that following the link shows the slide in
 * the deck. Presenter notes follow the slide in an `aside` in its section.
 * Recaps only have the heading of the slide they recap, followed by a link to
 * it.
 */
export function DeckDocument({ children }: DeckDocumentProps): JSX.Element {
  return <DeckDocumentContext value>{children}</DeckDocumentContext>;
}

function getProp(slide: ReactNode, name: string): string | undefined {
  if (isValidElement<Record<string, unknown>>(slide)) {
    const value = slide.props[name];
    if (typeof value === 'string' && value !== '') {
      return value;
    }
  }
  return undefined;
}

interface DocumentRecapProps {
  /** The props of the recap, with those of the slide it recaps. */
  slide: SlideProps;
  /** The location hash of the recapped slide. */
  href: string;
  /** The title of the recapped slide if it has none. */
  untitled: string;
  label: string;
  labelLang: string | undefined;
}

/** Renders a recap as the heading of the slide it recaps, linking to it. */
function DocumentRecap({
  slide: { master, title, lang },
  href,
  untitled,
  label,
  labelLang,
}: DocumentRecapProps): JSX.Element {
  return (
    <Slide master={master ?? 'content'} title={title} lang={lang}>
      <p>
        {labelLang === undefined ? (
          label
        ) : (
          <span lang={labelLang}>{label}</span>
        )}{' '}
        <a href={href}>{title ?? untitled}</a>
      </p>
    </Slide>
  );
}

function noop() {
  // The document can't be navigated.
}

interface DocumentNotesProps {
  notes: ReactNode;
  label: string;
  /** The language of `label`, if it differs from that of the notes. */
  labelLang: string | undefined;
}

function DocumentNotes({
  notes,
  label,
  labelLang,
}: DocumentNotesProps): JSX.Element {
  const id = useId();
  return (
    // Marked, unlike other asides, e.g., for the colophon of the page.
    <aside data-seminar-notes="" aria-labelledby={id}>
      <h5 id={id} lang={labelLang}>
        {label}
      </h5>
      {notes}
    </aside>
  );
}

/** Renders the slides of a {@link Deck} as a document, see {@link DeckDocument}. */
export function DocumentDeck({
  children,
  options = {},
  theme = defaultSlideTheme,
  toc: tocEntries,
  lang,
  uiLocales,
}: DeckProps): JSX.Element {
  const locale =
    (lang === undefined ? undefined : findLocale(uiLocales ?? [], lang)) ??
    uiLocales?.[0] ??
    ENGLISH;
  const t: Translate = createTranslate(locale);
  // Slides are positional children, so we need to index into them.
  // eslint-disable-next-line @eslint-react/no-children-to-array
  const raw = Children.toArray(children);
  // Recaps have the ids that the deck shows them with.
  const { slides, recapOf } = resolveRecaps(
    raw,
    raw.map((slide) => getProp(slide, 'id')),
    getAliases(raw),
  );
  const slideIds = slides.map((slide) => getProp(slide, 'id'));
  const slideLangs = slides.map((slide) => getProp(slide, 'lang') ?? lang);
  const [stateStores] = useState(createStateStores);
  const stepStores = useMemo(
    () => slides.map(() => new StepStore()),
    // A store for each slide.
    // eslint-disable-next-line react-hooks/exhaustive-deps, @eslint-react/exhaustive-deps
    [slides.length],
  );
  const none = slides.map(() => false);
  const deck: DeckState = {
    lang,
    slideLangs,
    slideIndex: 0,
    slideCount: slides.length,
    atFirstStep: true,
    atLastStep: false,
    nextSlideIndex: undefined,
    previousSlideIndex: undefined,
    firstSlideIndex: 0,
    lastSlideIndex: Math.max(slides.length - 1, 0),
    spares: slides.map(
      (slide) =>
        isValidElement<{ spare?: unknown }>(slide) &&
        slide.props.spare === true,
    ),
    recapOf,
    hasSteps: none,
    hasState: none,
    stateChanged: none,
    transientStateChanged: false,
    resetSlide: noop,
    deckChanged: false,
    resetDeck: noop,
    goTo: noop,
    next: noop,
    previous: noop,
    nextSlide: noop,
    previousSlide: noop,
    firstStep: noop,
    lastStep: noop,
    mouseNavigation: false,
    setMouseNavigation: noop,
    toc: resolveToc(tocEntries ?? [], slides, slideIds, {
      untitled: t('untitled'),
      slide: (index) => t('slide', { number: index + 1 }),
    }),
    showToc: false,
    setShowToc: noop,
    showSteps: false,
    setShowSteps: noop,
    showOverview: false,
    setShowOverview: noop,
    overviewIndex: 0,
    setOverviewIndex: noop,
  };
  return (
    <ThemeProvider theme={theme}>
      <UiLanguageContext
        value={{
          lang: locale.lang,
          t,
          locales: uiLocales ?? [ENGLISH],
          setLang: noop,
        }}
      >
        <DeckContext value={deck}>
          <SeminarOptionsContext value={options}>
            <StateStoresContext value={stateStores}>
              <SharedWorkProvider>
                {slides.map((slide, index) => {
                  const original = recapOf[index];
                  const notes =
                    original === undefined ? getSlideNotes(slide) : undefined;
                  // Only if the language of the slide is known.
                  const labelLang =
                    slideLangs[index] === undefined ||
                    locale.lang === slideLangs[index]
                      ? undefined
                      : locale.lang;
                  const store = stepStores[index] ?? new StepStore();
                  const href = formatLocation(
                    { slideIndex: index, step: [] },
                    slideIds,
                  );
                  return (
                    // Slides are positional, see `Deck`.
                    // eslint-disable-next-line @eslint-react/no-array-index-key
                    <StepStoreContext key={index} value={store}>
                      <SlideViewProvider
                        view={{
                          index,
                          kind: 'document',
                          interactive: false,
                        }}
                      >
                        {/* Without a label, which would make every slide
                                a landmark. */}
                        <section
                          // Marked, unlike other sections, e.g., for the
                          // colophon of the page.
                          data-seminar-slide=""
                          lang={
                            slideLangs[index] === lang
                              ? undefined
                              : slideLangs[index]
                          }
                        >
                          <DocumentSlideContext
                            value={{
                              anchor: slideIds[index] ?? href.slice(1),
                              href,
                              untitled: t('slide', { number: index + 1 }),
                              linkLabel: t('linkToSlide'),
                              labelLang,
                            }}
                          >
                            {original === undefined ||
                            !isValidElement<SlideProps>(slide) ? (
                              slide
                            ) : (
                              <DocumentRecap
                                slide={slide.props}
                                href={formatLocation(
                                  { slideIndex: original, step: [] },
                                  slideIds,
                                )}
                                untitled={t('slide', {
                                  number: original + 1,
                                })}
                                label={t('recapOf')}
                                labelLang={labelLang}
                              />
                            )}
                          </DocumentSlideContext>
                          {notes !== undefined && (
                            <DocumentNotes
                              notes={notes}
                              label={t('presenterNotes')}
                              labelLang={labelLang}
                            />
                          )}
                        </section>
                      </SlideViewProvider>
                    </StepStoreContext>
                  );
                })}
              </SharedWorkProvider>
            </StateStoresContext>
          </SeminarOptionsContext>
        </DeckContext>
      </UiLanguageContext>
    </ThemeProvider>
  );
}
