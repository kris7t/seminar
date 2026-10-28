import { Box, GlobalStyles, ThemeProvider, useTheme } from '@mui/material';
import type { Theme } from '@mui/material/styles';
import {
  Component,
  Suspense,
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type JSX,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';

import { useDeck } from '../deck/DeckContext.ts';
import type { DeckMetadata } from '../deck/DeckMetadata.ts';
import { resolveToc, type ResolvedTocEntry } from '../deck/tableOfContents.ts';
import { uiTheme } from '../menu/uiTheme.ts';
import { getSlideNotes } from '../notes/Notes.tsx';
import { StepStore, type StepPath } from '../steps/StepStore.ts';
import { StepStoreContext } from '../steps/StepStoreContext.ts';
import { SLIDE_HEIGHT, SLIDE_WIDTH } from '../theme/createSlideTheme.ts';
import { useTransitionHold } from '../transitions/settling.ts';
import { SlideTransitionsContext } from '../transitions/SlideTransitions.ts';
import {
  SLIDE_VIEW_ATTRIBUTE,
  type SlideView,
} from '../view/SlideViewContext.ts';
import { SlideViewProvider } from '../view/SlideViewProvider.tsx';
import { PagePlan, type PlannedPage } from './PagePlan.ts';
import { PrintTransitions } from './PrintTransitions.ts';

/**
 * How the pages of the slides are laid out on the sheets of paper:
 *
 * - `'slides'`: each page on a sheet as large as the slide.
 * - `'notes'`: each page on a sheet of the paper chosen when printing, with
 *   the notes of the slide below its last page.
 * - `'grid'`: several pages on each sheet of the paper chosen when printing.
 */
export type PrintLayout = 'slides' | 'notes' | 'grid';

/** Numbers of pages that the `'grid'` layout can put on a sheet. */
export type PagesPerSheet = 2 | 4 | 6;

/** How slides are printed. */
export interface PrintOptions {
  /**
   * Which steps of the slides to make pages of: `'split'` for as few as
   * needed to show everything (see `StepStore.getSplitPaths`), or `'steps'`
   * for every step.
   */
  pages: 'split' | 'steps';
  /** Whether to print spare slides, too. */
  spares: boolean;
  layout: PrintLayout;
  /** Number of pages on a sheet in the `'grid'` layout. */
  perSheet: PagesPerSheet;
  /**
   * Whether sheets of the paper chosen when printing have a header with the
   * title of the deck, its authors, event, and date, and a footer with the
   * number of the sheet.
   */
  headers: boolean;
}

/** A sheet of paper that was printed. */
export interface PrintedSheet {
  /**
   * Id of the element that the sheet starts with, which links point to, so
   * that it is a named destination in PDFs printed by Chromium.
   */
  id: string;
  /** Label of the sheet, e.g., the number of its slide, if it has one. */
  label?: string | undefined;
}

/** An entry of the outline of the printed sheets, e.g., a section. */
export interface PrintedOutlineEntry {
  title: string;
  /** Index of the sheet that the entry goes to. */
  sheet: number;
  children: PrintedOutlineEntry[];
}

/** What was printed, e.g., to make the outline and page labels of a PDF. */
export interface PrintedDocument {
  sheets: PrintedSheet[];
  /**
   * The outline: the table of contents of the deck, or else the slides with
   * titles.
   */
  outline: PrintedOutlineEntry[];
  /** What the deck tells about itself, with its title. */
  metadata: DeckMetadata & { title: string };
}

/** Id of the element with the pages, the only one shown when printing. */
export const PRINT_ID = 'seminar-print';

/** Data attribute of the titles of outline entries with their sheets. */
const OUTLINE_ATTRIBUTE = 'data-seminar-outline';

/** Data attribute of pages with the number of their slide. */
export const PAGE_ATTRIBUTE = 'data-seminar-page';

/** Data attribute of the sheets of paper that the pages are on. */
export const SHEET_ATTRIBUTE = 'data-seminar-sheet';

/** How the `'grid'` layout arranges the pages on a sheet. */
const GRIDS: Readonly<
  Record<
    PagesPerSheet,
    { columns: number; orientation: 'portrait' | 'landscape' }
  >
> = {
  2: { columns: 1, orientation: 'portrait' },
  4: { columns: 2, orientation: 'landscape' },
  6: { columns: 2, orientation: 'portrait' },
};

/** Margin of the sheets of paper chosen when printing. */
const SHEET_MARGIN = '15mm';

/** Space between the pages on a sheet. */
const SHEET_GAP = '8mm';

/**
 * Width of the sheets of paper chosen when printing, without their margins,
 * on screen, and when printing in browsers that can't fit the slides to the
 * paper, about that of A4 and Letter in portrait.
 */
const SHEET_WIDTH = 680;

/** Returns `text` as a string of CSS. */
function cssString(text: string): string {
  return `"${text.replaceAll(/["\\]/g, '\\$&').replaceAll(/\r?\n/g, '\\A ')}"`;
}

/**
 * Returns the margin boxes of the header and footer of the sheets, which the
 * browser shows instead of its own header and footer.
 */
function marginBoxes(metadata: DeckMetadata | undefined): string {
  const title = metadata?.title ?? document.title;
  const details = [
    metadata?.authors?.join(', '),
    metadata?.event,
    metadata?.date,
  ]
    .filter((detail) => detail !== undefined && detail !== '')
    .join(' · ');
  const font = `font: 9pt ${uiTheme.typography.fontFamily ?? 'sans-serif'}; color: ${uiTheme.palette.text.secondary};`;
  return `
  @top-left { content: ${cssString(title)}; ${font} }
  @top-right { content: ${cssString(details)}; ${font} }
  @bottom-center { content: counter(page) " / " counter(pages); ${font} }`;
}

function printStyles(
  { layout, perSheet, headers }: PrintOptions,
  metadata: DeckMetadata | undefined,
): string {
  const page =
    layout === 'slides'
      ? `size: ${String(SLIDE_WIDTH)}px ${String(SLIDE_HEIGHT)}px; margin: 0;`
      : // The paper is chosen when printing, but not its orientation.
        `size: ${layout === 'grid' ? GRIDS[perSheet].orientation : 'portrait'}; margin: ${SHEET_MARGIN};`;
  const boxes =
    layout !== 'slides' && headers
      ? marginBoxes(metadata)
      : // Empty margin boxes leave out the header and footer of the browser.
        `
  @top-left { content: ""; }
  @bottom-left { content: ""; }`;
  return `
@page {
  ${page}${boxes}
}

@media print {
  html, body {
    margin: 0;
    padding: 0;
    height: auto;
    overflow: visible;
    background: none;
  }

  body > :not(#${PRINT_ID}) {
    display: none !important;
  }

  #${PRINT_ID} {
    position: static !important;
    width: auto !important;
  }
}
`;
}

/** How often to check whether the pages are ready, in milliseconds. */
const CHECK_INTERVAL = 50;

/** Number of checks in a row that find nothing changing before printing. */
const QUIET_CHECKS = 3;

/** How long to wait for the pages at most, in milliseconds. */
const MAX_WAIT = 10_000;

/**
 * Waits until the pages in `root` stop changing, nothing holds them, e.g., a
 * diagram that is still being rendered, and their fonts and images are
 * loaded, or until {@link MAX_WAIT} passes.
 */
async function waitUntilReady(
  root: HTMLElement,
  transitions: PrintTransitions,
  signal: AbortSignal,
): Promise<void> {
  const start = performance.now();
  let pages = -1;
  let quiet = 0;
  while (quiet < QUIET_CHECKS && performance.now() - start < MAX_WAIT) {
    await new Promise((resolve) => {
      setTimeout(resolve, CHECK_INTERVAL);
    });
    signal.throwIfAborted();
    const images = [...root.querySelectorAll('img')];
    for (const image of images) {
      // Pages are outside of the viewport until they are printed.
      image.loading = 'eager';
    }
    await Promise.allSettled([
      ...('fonts' in document ? [document.fonts.ready] : []),
      ...images.map((image) =>
        'decode' in image ? image.decode() : undefined,
      ),
    ]);
    signal.throwIfAborted();
    const count = root.querySelectorAll(`[${PAGE_ATTRIBUTE}]`).length;
    quiet = transitions.isHeld() || count !== pages ? 0 : quiet + 1;
    pages = count;
  }
}

/** Holds the pages while a slide is suspended. */
function Pending(): null {
  useTransitionHold(true);
  return null;
}

/** Leaves out a page that fails to render. */
class PrintBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  override state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  override render(): ReactNode {
    return this.state.failed ? null : this.props.children;
  }
}

interface PageProps {
  index: number;
  slide: ReactNode;
  store: StepStore;
  theme: Theme;
  /** Whether the page only plans the pages, rather than being printed. */
  measuring?: boolean;
}

/** A page with the slide at the step of `store`, as large as the slide. */
function Page({
  index,
  slide,
  store,
  theme,
  measuring = false,
}: PageProps): JSX.Element {
  const view = useMemo<SlideView>(
    () => ({ index, kind: 'print', interactive: false }),
    [index],
  );
  return (
    <ThemeProvider theme={theme}>
      <Box
        {...{
          [SLIDE_VIEW_ATTRIBUTE]: 'print',
          ...(measuring ? {} : { [PAGE_ATTRIBUTE]: String(index + 1) }),
        }}
        sx={{
          position: 'relative',
          width: SLIDE_WIDTH,
          height: SLIDE_HEIGHT,
          overflow: 'hidden',
          bgcolor: 'background.default',
          color: 'text.primary',
          printColorAdjust: 'exact',
          WebkitPrintColorAdjust: 'exact',
        }}
      >
        <StepStoreContext value={store}>
          <SlideViewProvider view={view}>
            <Suspense fallback={<Pending />}>{slide}</Suspense>
          </SlideViewProvider>
        </StepStoreContext>
      </Box>
    </ThemeProvider>
  );
}

/** A page with the slide at `path`. */
function PageAt({
  path,
  ...props
}: Omit<PageProps, 'store'> & { path: StepPath }): JSX.Element {
  const [store] = useState(() => new StepStore({ target: path }));
  return <Page store={store} {...props} />;
}

/**
 * A page scaled to the width available, e.g., on a sheet of the paper chosen
 * when printing, which only CSS knows.
 */
function FittedPage({
  columns,
  children,
}: {
  /** Number of pages side by side, for browsers that can't fit them. */
  columns: number;
  children: ReactNode;
}): JSX.Element {
  return (
    <Box sx={{ containerType: 'inline-size', breakInside: 'avoid' }}>
      <Box
        sx={{
          position: 'relative',
          aspectRatio: `${String(SLIDE_WIDTH)} / ${String(SLIDE_HEIGHT)}`,
          overflow: 'hidden',
          // Inside, unlike outlines, which spill onto the sheet before it.
          '&::after': {
            content: '""',
            position: 'absolute',
            inset: 0,
            border: 1,
            borderColor: 'divider',
            pointerEvents: 'none',
          },
        }}
      >
        <Box
          sx={{
            position: 'absolute',
            top: 0,
            left: 0,
            transformOrigin: '0 0',
            scale: String(SHEET_WIDTH / columns / SLIDE_WIDTH),
            [`@supports (scale: calc(1px / 1px))`]: {
              scale: `calc(100cqi / ${String(SLIDE_WIDTH)}px)`,
            },
          }}
        >
          {children}
        </Box>
      </Box>
    </Box>
  );
}

/** Styles of the contents of notes, which may be Markdown. */
const NOTES_STYLES = {
  typography: 'body2',
  '& > :first-of-type, & > * > :first-of-type': { mt: 0 },
  '& > :last-child, & > * > :last-child': { mb: 0 },
  '& p, & ul, & ol': { my: 1 },
  '& ul, & ol': { pl: 3 },
} as const;

/** Returns the id of the sheet at `index`. */
function sheetId(index: number): string {
  return `${PRINT_ID}-sheet-${String(index + 1)}`;
}

/** A sheet of paper, which starts a new sheet when printing. */
function Sheet({
  index,
  children,
}: {
  index: number;
  children: ReactNode;
}): JSX.Element {
  return (
    <Box
      id={sheetId(index)}
      {...{ [SHEET_ATTRIBUTE]: '' }}
      sx={{
        breakBefore: 'page',
        '&:first-of-type': { breakBefore: 'auto' },
      }}
    >
      {children}
    </Box>
  );
}

/** An entry of the outline with the title still to be rendered. */
interface OutlineNode {
  title: ReactNode;
  sheet: number;
  children: OutlineNode[];
}

/**
 * Returns the entries of `toc` whose slides are printed, going to their
 * first sheets in `firstSheets`, by slide, with the nested entries of the
 * other entries in their place.
 */
function printedToc(
  toc: readonly ResolvedTocEntry[],
  firstSheets: ReadonlyMap<number, number>,
): OutlineNode[] {
  return toc.flatMap(({ title, slideIndex, hasSlide, children }) => {
    const nested = printedToc(children, firstSheets);
    const sheet = hasSlide ? firstSheets.get(slideIndex) : nested[0]?.sheet;
    return sheet === undefined ? nested : [{ title, sheet, children: nested }];
  });
}

/** Renders the titles of the outline, to read them as text. */
function OutlineTitles({ nodes }: { nodes: readonly OutlineNode[] }) {
  return (
    <ul>
      {nodes.map(({ title, sheet, children }, i) => (
        // Entries are positional.
        // eslint-disable-next-line @eslint-react/no-array-index-key
        <li key={i}>
          <span {...{ [OUTLINE_ATTRIBUTE]: String(sheet) }}>{title}</span>
          {children.length > 0 && <OutlineTitles nodes={children} />}
        </li>
      ))}
    </ul>
  );
}

/** Reads the outline from its titles in `list` (see {@link OutlineTitles}). */
function readOutline(list: Element | null): PrintedOutlineEntry[] {
  return [...(list?.children ?? [])].flatMap((item) => {
    const title = item.querySelector(`:scope > [${OUTLINE_ATTRIBUTE}]`);
    if (title === null) {
      return [];
    }
    return [
      {
        title: title.textContent.replaceAll(/\s+/g, ' ').trim(),
        sheet: Number(title.getAttribute(OUTLINE_ATTRIBUTE)),
        children: readOutline(item.querySelector(':scope > ul')),
      },
    ];
  });
}

export interface PrintViewProps {
  slides: readonly ReactNode[];
  /** Whether each slide is spare. */
  spares: readonly boolean[];
  options: PrintOptions;
  /** What the deck tells about itself, e.g., for the headers of the sheets. */
  metadata?: DeckMetadata | undefined;
  /** Called once the pages are ready to be printed, with what they are. */
  onReady: (printed: PrintedDocument) => void;
}

/**
 * Renders the slides as pages for printing outside of the viewport, and
 * replaces the rest of the document with them when printing. The pages are
 * laid out on sheets of paper according to the `layout` of `options`.
 */
export function PrintView({
  slides,
  spares,
  options,
  metadata,
  onReady,
}: PrintViewProps): JSX.Element {
  const theme = useTheme();
  const { slideLangs, toc } = useDeck();
  const [transitions] = useState(() => new PrintTransitions());
  // The stores of the slides, which show their last steps.
  const [stores] = useState(
    () =>
      new Map(
        slides.flatMap((_, index) =>
          options.spares || spares[index] !== true
            ? [[index, new StepStore({ toEnd: true })] as const]
            : [],
        ),
      ),
  );
  const [plan] = useState(
    () => new PagePlan(stores, options.pages === 'steps'),
  );
  const pages = useSyncExternalStore(
    plan.subscribe,
    plan.getPages,
    plan.getPages,
  );
  const { layout } = options;
  const columns = layout === 'grid' ? GRIDS[options.perSheet].columns : 1;
  // Pages on each sheet.
  const perSheet = layout === 'grid' ? options.perSheet : 1;
  const sheetCount = Math.ceil(pages.length / perSheet);
  const outline = useMemo(() => {
    const firstSheets = new Map<number, number>();
    for (const [i, { index }] of pages.entries()) {
      if (!firstSheets.has(index)) {
        firstSheets.set(index, Math.floor(i / perSheet));
      }
    }
    return printedToc(
      toc.length > 0
        ? toc
        : resolveToc(
            slides.map((_, slide) => ({ slide })),
            slides,
            [],
          ).filter(({ standIn }) => standIn !== true),
      firstSheets,
    );
  }, [pages, perSheet, toc, slides]);
  const ref = useRef<HTMLDivElement>(null);
  const outlineRef = useRef<HTMLDivElement>(null);
  const ready = useEffectEvent(() => {
    onReady({
      sheets: Array.from({ length: sheetCount }, (_, sheet) => {
        // The number of the slide, unless several slides share the sheet.
        const page = layout === 'grid' ? undefined : pages[sheet];
        return {
          id: sheetId(sheet),
          ...(page === undefined ? {} : { label: String(page.index + 1) }),
        };
      }),
      outline: readOutline(outlineRef.current?.firstElementChild ?? null),
      metadata: { ...metadata, title: metadata?.title ?? document.title },
    });
  });
  useEffect(() => {
    const root = ref.current;
    if (root === null) {
      return undefined;
    }
    const controller = new AbortController();
    waitUntilReady(root, transitions, controller.signal).then(
      () => {
        ready();
      },
      () => undefined,
    );
    return () => {
      controller.abort();
    };
  }, [transitions]);
  const renderPage = ({ index, path }: PlannedPage): ReactNode => {
    const page = (
      <PageAt index={index} slide={slides[index]} theme={theme} path={path} />
    );
    return (
      <PrintBoundary>
        {layout === 'slides' ? (
          page
        ) : (
          <FittedPage columns={columns}>{page}</FittedPage>
        )}
      </PrintBoundary>
    );
  };
  let sheets: ReactNode;
  if (layout === 'grid') {
    sheets = Array.from(
      { length: Math.ceil(pages.length / perSheet) },
      (_, sheet) => (
        // Sheets are positional.
        <Sheet key={sheet} index={sheet}>
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: `repeat(${String(columns)}, minmax(0, 1fr))`,
              gap: SHEET_GAP,
            }}
          >
            {pages
              .slice(sheet * perSheet, (sheet + 1) * perSheet)
              .map((page) => (
                <Box key={page.key}>{renderPage(page)}</Box>
              ))}
          </Box>
        </Sheet>
      ),
    );
  } else {
    sheets = pages.map((page, i) => {
      const notes =
        layout === 'notes' && pages[i + 1]?.index !== page.index
          ? getSlideNotes(slides[page.index])
          : undefined;
      return (
        <Sheet key={page.key} index={i}>
          {renderPage(page)}
          {notes !== undefined && (
            <Box
              lang={slideLangs[page.index]}
              sx={[NOTES_STYLES, { mt: SHEET_GAP }]}
            >
              {notes}
            </Box>
          )}
        </Sheet>
      );
    });
  }
  return createPortal(
    <SlideTransitionsContext value={transitions}>
      <GlobalStyles styles={printStyles(options, metadata)} />
      {/* The slides at their last steps, which plan the pages. */}
      <Box inert aria-hidden sx={{ position: 'fixed', left: -100000, top: 0 }}>
        {[...stores].map(([index, store]) => (
          <PrintBoundary key={index}>
            <Page
              index={index}
              slide={slides[index]}
              store={store}
              theme={theme}
              measuring
            />
          </PrintBoundary>
        ))}
      </Box>
      {/* Handouts are on white paper, whatever the slides look like. */}
      <ThemeProvider theme={layout === 'slides' ? theme : uiTheme}>
        <Box
          ref={ref}
          id={PRINT_ID}
          inert
          aria-hidden
          sx={{
            position: 'fixed',
            left: -100000,
            top: 0,
            width: layout === 'slides' ? 'auto' : SHEET_WIDTH,
            color: 'text.primary',
          }}
        >
          {sheets}
          {/* Links make the sheets named destinations in PDFs, and the
              titles of the outline are read as text. */}
          <Box ref={outlineRef} component="nav" sx={{ display: 'none' }}>
            <OutlineTitles nodes={outline} />
            {Array.from({ length: sheetCount }, (_, sheet) => (
              // Sheets are positional.
              <a key={sheet} href={`#${sheetId(sheet)}`} />
            ))}
          </Box>
        </Box>
      </ThemeProvider>
    </SlideTransitionsContext>,
    document.body,
  );
}
