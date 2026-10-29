import {
  Box,
  ButtonBase,
  ThemeProvider,
  Tooltip,
  Typography,
  useTheme,
  type Theme,
} from '@mui/material';
import {
  useEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
  type JSX,
  type ReactNode,
} from 'react';

import { useDeck } from '../deck/DeckContext.ts';
import { useT, useUiLanguage } from '../i18n/UiLanguageContext.ts';
import { RecapIcon } from '../icons/RecapIcon.tsx';
import { RecappedIcon } from '../icons/RecappedIcon.tsx';
import { SpareIcon } from '../icons/SpareIcon.tsx';
import { StateIcon } from '../icons/StateIcon.tsx';
import { StepsIcon } from '../icons/StepsIcon.tsx';
import type { ContextMenuHandlers } from '../interaction/useContextMenu.ts';
import { darkUiTheme } from '../menu/uiTheme.ts';
import {
  SCROLL_CLOSING_POPPER_OPTIONS,
  useScrollClosingTooltip,
} from '../menu/useScrollClosingTooltip.ts';
import { SLIDE_VIEW_ATTRIBUTE } from '../view/SlideViewContext.ts';
import { groupSlides } from './groupSlides.ts';
import { slideTitles } from '../deck/tableOfContents.ts';
import { THUMBNAIL_HEIGHT, THUMBNAIL_WIDTH } from './captureThumbnail.ts';
import type { ThumbnailCache } from './ThumbnailCache.ts';

/** Typography of the headings of divisions by their level. */
const HEADING_VARIANTS = ['h4', 'h5', 'h6'] as const;

const HEADING_ELEMENTS = ['h2', 'h3', 'h4'] as const;

/** Hides text from sight, but not from screen readers. */
const VISUALLY_HIDDEN = {
  position: 'absolute',
  width: 1,
  height: 1,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  whiteSpace: 'nowrap',
} as const;

interface ThumbnailProps {
  index: number;
  /** The theme of the slides, rather than of the overview. */
  slideTheme: Theme;
  cache: ThumbnailCache;
  /** The title of the slide in the table of contents, if any. */
  title: ReactNode;
  /** The language of the slide, and its title. */
  lang: string | undefined;
  current: boolean;
  /** Whether the slide has steps, which is shown by its number. */
  steps: boolean;
  /** Whether the slide has state, which is shown by its number. */
  state: boolean;
  /** Whether the state of the slide was changed. */
  stateChanged: boolean;
  /** Whether the slide is spare, which is shown by its number. */
  spare: boolean;
  /** Whether the slide is a recap, which is shown by its number. */
  recap: boolean;
  /** Whether the slide is recapped later, which is shown by its number. */
  recapped: boolean;
  onSelect: (index: number) => void;
}

function Thumbnail({
  index,
  slideTheme,
  cache,
  title,
  lang,
  current,
  steps,
  state,
  stateChanged,
  spare,
  recap,
  recapped,
  onSelect,
}: ThumbnailProps): JSX.Element {
  const t = useT();
  // Told after the title, in the order of the icons.
  const notes = [
    ...(spare ? [t('spareNote')] : []),
    ...(recap ? [t('recapNote')] : []),
    ...(recapped ? [t('recappedLaterNote')] : []),
    ...(state ? [t(stateChanged ? 'changedNote' : 'keepsChangesNote')] : []),
    ...(steps ? [t('withStepsNote')] : []),
  ];
  const ref = useRef<HTMLButtonElement>(null);
  const [tooltipOpen, setTooltipOpen] = useScrollClosingTooltip(ref);
  const image = useSyncExternalStore(
    cache.subscribe,
    () => cache.get(index),
    () => undefined,
  );
  const background = useSyncExternalStore(
    cache.subscribe,
    () => cache.getBackground(index),
    () => undefined,
  );
  // Keep the focus on the current slide, so that Enter selects it when the
  // arrow keys change the current slide.
  useEffect(() => {
    if (current) {
      ref.current?.focus({ preventScroll: true });
      ref.current?.scrollIntoView({ block: 'nearest' });
    }
  }, [current]);
  return (
    <Box
      sx={{
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        gap: 1,
        p: 1,
      }}
    >
      {/* The slide in its own theme, in the user interface around it. */}
      <ThemeProvider theme={slideTheme}>
        <Box
          {...{ [SLIDE_VIEW_ATTRIBUTE]: 'thumbnail' }}
          data-seminar-thumbnail-index={index}
          sx={[
            {
              position: 'relative',
              width: THUMBNAIL_WIDTH,
              height: THUMBNAIL_HEIGHT,
              overflow: 'hidden',
              bgcolor: 'background.default',
              // Layer translucent master colors over the slide theme's base.
              backgroundImage:
                background === undefined
                  ? undefined
                  : `linear-gradient(${background}, ${background})`,
              color: 'text.primary',
            },
            // The outline is part of the overview, rather than of the slide.
            current && {
              outline: '3px solid',
              outlineColor: darkUiTheme.palette.primary.main,
            },
            // Spare slides are skipped when going through the deck.
            spare && !current && { opacity: 0.5 },
          ]}
        >
          {image !== undefined && (
            <Box
              component="img"
              src={image}
              alt=""
              draggable={false}
              sx={{ display: 'block', width: '100%', height: '100%' }}
            />
          )}
        </Box>
      </ThemeProvider>
      <Typography
        variant="caption"
        sx={{
          display: 'flex',
          justifyContent: 'center',
          gap: 0.5,
          color: current ? 'text.primary' : 'text.secondary',
          fontSize: 14,
          // Icons at half their size, so that their strokes fall on whole
          // pixels, and centered on the digits rather than on the line, which
          // includes the space below them.
          lineHeight: '20px',
          alignItems: 'flex-start',
          '& > svg, & > .MuiBadge-root': { mt: '4px' },
          '& > svg, & > .MuiBadge-root > svg': { fontSize: 12 },
        }}
      >
        {index + 1}
        {/* In the order of the table of contents. */}
        {spare && <SpareIcon small fontSize="inherit" />}
        {recap && <RecapIcon small fontSize="inherit" />}
        {recapped && <RecappedIcon small fontSize="inherit" />}
        {state && <StateIcon small changed={stateChanged} fontSize="inherit" />}
        {steps && <StepsIcon small fontSize="inherit" />}
      </Typography>
      {/*
       * Covers the thumbnail instead of containing it, since the contents of
       * a button would inherit its styles, like centered text.
       */}
      <Tooltip
        // Shows the title of slides that don't show it, e.g., with their
        // master, or recaps with a title of their own.
        title={title === undefined ? '' : <span lang={lang}>{title}</span>}
        // The button has a name of its own.
        describeChild
        enterDelay={500}
        enterNextDelay={500}
        open={tooltipOpen}
        onOpen={() => {
          setTooltipOpen(true);
        }}
        onClose={() => {
          setTooltipOpen(false);
        }}
        slotProps={{ popper: { popperOptions: SCROLL_CLOSING_POPPER_OPTIONS } }}
      >
        <ButtonBase
          ref={ref}
          aria-current={current ? 'page' : undefined}
          onClick={() => {
            onSelect(index);
          }}
          sx={{
            position: 'absolute',
            inset: 0,
            borderRadius: 1,
            '&:hover, &.Mui-focusVisible': {
              outline: '2px solid',
              outlineColor: 'grey.500',
            },
          }}
        >
          {/* Titles may have markup, so they can't go in an aria-label. */}
          <Box component="span" sx={VISUALLY_HIDDEN}>
            {t('slide', { number: index + 1 })}
            {title !== undefined && (
              <>
                : <span lang={lang}>{title}</span>
              </>
            )}
            {notes.map((note) => ` (${note})`)}
          </Box>
        </ButtonBase>
      </Tooltip>
    </Box>
  );
}

export interface SlideOverviewProps {
  slides: readonly ReactNode[];
  cache: ThumbnailCache;
  onClose: () => void;
  /** Handlers that open the context menu of the deck. */
  menuHandlers?: ContextMenuHandlers | undefined;
  /**
   * Distance from the top of the window, e.g., below the title bar, which
   * still moves the window.
   */
  top?: number | undefined;
}

/**
 * Shows cached images of the slides in grids, with their last shown
 * appearance, and goes to a slide when it is clicked, keeping its steps.
 *
 * The slides are grouped by the divisions of the table of contents, like
 * sections, with their titles as headings (see {@link groupSlides}).
 *
 * The navigation keys move between the slides without changing their steps,
 * Up and Down jump between the divisions, and Enter goes to the highlighted
 * slide.
 *
 * Should be rendered with the theme of the slides.
 */
export function SlideOverview({
  slides,
  cache,
  onClose,
  menuHandlers,
  top = 0,
}: SlideOverviewProps): JSX.Element {
  const {
    overviewIndex,
    goTo,
    toc,
    spares,
    recapOf,
    hasSteps,
    hasState,
    stateChanged,
    lang,
    slideLangs,
  } = useDeck();
  const { lang: uiLang, t } = useUiLanguage();
  const slideTheme = useTheme();
  const overviewRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const root = overviewRef.current;
    if (root === null || typeof IntersectionObserver !== 'function')
      return undefined;
    const visible = new Set<number>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const index = Number(
            entry.target.getAttribute('data-seminar-thumbnail-index'),
          );
          if (entry.isIntersecting) visible.add(index);
          else visible.delete(index);
        }
        cache.setVisible(visible);
      },
      { root },
    );
    for (const frame of root.querySelectorAll('[data-seminar-thumbnail-index]'))
      observer.observe(frame);
    return () => {
      observer.disconnect();
      cache.setVisible([]);
    };
  }, [cache, slides.length]);
  const groups = useMemo(
    () => groupSlides(toc, slides.length),
    [toc, slides.length],
  );
  const titles = useMemo(() => slideTitles(toc, slides), [toc, slides]);
  const onSelect = (index: number) => {
    // Keep the steps shown in the thumbnail.
    goTo(index, 'restore');
    onClose();
  };
  return (
    // The overview is part of the user interface, on a dark background, while
    // the thumbnails keep the theme of the slides.
    <ThemeProvider theme={darkUiTheme}>
      <Box
        ref={overviewRef}
        // Not a dialog, so that the navigation keys still work in it.
        role="region"
        aria-label={t('slideOverview')}
        lang={uiLang}
        {...menuHandlers}
        sx={{
          position: 'fixed',
          inset: 0,
          top,
          overflowY: 'auto',
          p: 2,
          bgcolor: 'background.default',
          color: 'text.primary',
          // Dark, thin scrollbars on the dark background.
          colorScheme: 'dark',
          scrollbarWidth: 'thin',
          WebkitTouchCallout: 'none',
        }}
      >
        {groups.map(
          ({ title, level, start, hasSlide, standIn, slides: groupSlides }) => {
            // Titles are in the language of the slide of the division, or of
            // the deck, unless they stand in for one.
            const titleLang =
              standIn === true
                ? undefined
                : hasSlide === true
                  ? slideLangs[start]
                  : lang;
            // Divisions of only spare slides are dimmed like their thumbnails.
            const spare =
              groupSlides.length > 0 &&
              groupSlides.every((index) => spares[index] === true);
            return (
              <Box
                component="section"
                key={`${String(start)}-${String(level)}`}
                sx={{ '& + &': { mt: 3 } }}
              >
                {title !== undefined && (
                  <Typography
                    variant={HEADING_VARIANTS[level] ?? 'h6'}
                    component={HEADING_ELEMENTS[level] ?? 'h4'}
                    sx={[
                      {
                        display: 'flex',
                        alignItems: 'center',
                        gap: 1,
                        color: 'text.primary',
                        mx: 1,
                        mb: 1,
                      },
                      spare && { opacity: 0.5 },
                    ]}
                  >
                    <span lang={titleLang}>{title}</span>
                    {spare && <SpareIcon sx={{ fontSize: '0.8em' }} />}
                  </Typography>
                )}
                <Box
                  sx={{
                    display: 'grid',
                    gridTemplateColumns: `repeat(auto-fill, ${String(THUMBNAIL_WIDTH + 16)}px)`,
                    gap: 1,
                  }}
                >
                  {groupSlides.map((index) => (
                    <Thumbnail
                      key={index}
                      index={index}
                      slideTheme={slideTheme}
                      cache={cache}
                      title={titles[index]}
                      lang={slideLangs[index]}
                      current={index === overviewIndex}
                      steps={hasSteps[index] === true}
                      state={hasState[index] === true}
                      stateChanged={stateChanged[index] === true}
                      spare={spares[index] === true}
                      recap={recapOf[index] !== undefined}
                      recapped={recapOf.includes(index)}
                      onSelect={onSelect}
                    />
                  ))}
                </Box>
              </Box>
            );
          },
        )}
      </Box>
    </ThemeProvider>
  );
}
