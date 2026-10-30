import AutoAwesomeMotionIcon from '@mui/icons-material/AutoAwesomeMotion';
import GridViewIcon from '@mui/icons-material/GridView';
import HighlightAltIcon from '@mui/icons-material/HighlightAlt';
import KeyboardDoubleArrowLeftIcon from '@mui/icons-material/KeyboardDoubleArrowLeft';
import KeyboardDoubleArrowRightIcon from '@mui/icons-material/KeyboardDoubleArrowRight';
import NavigateBeforeIcon from '@mui/icons-material/NavigateBefore';
import NavigateNextIcon from '@mui/icons-material/NavigateNext';
import TocIcon from '@mui/icons-material/Toc';
import {
  Box,
  Button,
  IconButton,
  Tooltip,
  type SvgIconProps,
} from '@mui/material';
import type { ComponentType, JSX, ReactNode } from 'react';

import { useDeck } from '../deck/DeckContext.ts';
import { formatShortcut } from '../i18n/messages.ts';
import { useT } from '../i18n/UiLanguageContext.ts';
import { NO_DRAG_REGION, TITLE_WIDTH } from './TitleBar.tsx';
import type { TitleBar } from './useTitleBar.ts';

interface ToolButtonProps {
  label: string;
  /** The keyboard shortcut, shown in the tooltip. */
  shortcut?: string;
  icon: ComponentType<SvgIconProps>;
  onClick: () => void;
  disabled?: boolean;
  /** Whether the button is a toggle that is on, if it's a toggle. */
  pressed?: boolean;
}

/** Button of a toolbar with an icon, and its label in a tooltip. */
export function ToolButton({
  label,
  shortcut,
  icon: Icon,
  onClick,
  disabled = false,
  pressed,
}: ToolButtonProps): JSX.Element {
  const t = useT();
  const button = (
    <IconButton
      aria-label={label}
      aria-pressed={pressed}
      disabled={disabled}
      onClick={onClick}
      color={pressed === true ? 'primary' : 'inherit'}
    >
      <Icon />
    </IconButton>
  );
  // Tooltips need an element that gets pointer events, unlike a disabled
  // button.
  return disabled ? (
    button
  ) : (
    <Tooltip
      title={
        shortcut === undefined
          ? label
          : `${label} (${formatShortcut(t, shortcut)})`
      }
    >
      {button}
    </Tooltip>
  );
}

/** Group of controls of a toolbar, which don't move the window. */
export function ToolGroup({ children }: { children: ReactNode }): JSX.Element {
  return (
    <Box
      sx={{
        ...NO_DRAG_REGION,
        display: 'flex',
        alignItems: 'center',
        gap: 0.5,
      }}
    >
      {children}
    </Box>
  );
}

/**
 * The number of the current slide, which opens the dialog for going to a
 * slide by number.
 */
export function SlideNumberButton({
  onGoToSlide,
}: {
  onGoToSlide: () => void;
}): JSX.Element {
  const t = useT();
  const { slideIndex, slideCount } = useDeck();
  return (
    <Tooltip title={`${t('goToSlide')} (G)`}>
      <Button
        color="inherit"
        onClick={onGoToSlide}
        sx={{ minWidth: 72, fontVariantNumeric: 'tabular-nums' }}
      >
        {slideIndex + 1} / {slideCount}
      </Button>
    </Tooltip>
  );
}

/** Buttons that go to the previous and next steps and slides. */
export function NavigationButtons({
  onGoToSlide,
}: {
  onGoToSlide: () => void;
}): JSX.Element {
  const t = useT();
  const deck = useDeck();
  const { atFirstStep, atLastStep, nextSlideIndex, previousSlideIndex } = deck;
  return (
    <>
      <ToolButton
        label={t('previousSlide')}
        shortcut="PgUp"
        icon={KeyboardDoubleArrowLeftIcon}
        onClick={() => {
          deck.previousSlide();
        }}
        disabled={previousSlideIndex === undefined}
      />
      <ToolButton
        label={t('previousStep')}
        shortcut="Left"
        icon={NavigateBeforeIcon}
        onClick={deck.previous}
        disabled={previousSlideIndex === undefined && atFirstStep}
      />
      <SlideNumberButton onGoToSlide={onGoToSlide} />
      <ToolButton
        label={t('nextStep')}
        shortcut="Right"
        icon={NavigateNextIcon}
        onClick={deck.next}
        disabled={nextSlideIndex === undefined && atLastStep}
      />
      <ToolButton
        label={t('nextSlide')}
        shortcut="PgDn"
        icon={KeyboardDoubleArrowRightIcon}
        onClick={() => {
          deck.nextSlide();
        }}
        disabled={nextSlideIndex === undefined}
      />
    </>
  );
}

/** Buttons that show the overview, the table of contents, and the steps. */
export function ViewButtons(): JSX.Element {
  const t = useT();
  const {
    toc,
    showOverview,
    setShowOverview,
    showToc,
    setShowToc,
    showSteps,
    setShowSteps,
  } = useDeck();
  return (
    <>
      <ToolButton
        label={t('slideOverview')}
        shortcut="O"
        icon={GridViewIcon}
        pressed={showOverview}
        onClick={() => {
          setShowOverview(!showOverview);
        }}
      />
      <ToolButton
        label={t('tableOfContents')}
        shortcut="T"
        icon={TocIcon}
        pressed={showToc}
        disabled={toc.length === 0}
        onClick={() => {
          setShowToc(!showToc);
        }}
      />
      <ToolButton
        label={t('steps')}
        shortcut="Shift+T"
        icon={AutoAwesomeMotionIcon}
        pressed={showSteps}
        onClick={() => {
          setShowSteps(!showSteps);
        }}
      />
    </>
  );
}

/** Button that lets the mouse select text instead of navigating. */
export function TextSelectionButton(): JSX.Element {
  const t = useT();
  const { mouseNavigation, setMouseNavigation } = useDeck();
  return (
    <ToolButton
      label={t('textSelection')}
      shortcut="S"
      icon={HighlightAltIcon}
      pressed={!mouseNavigation}
      onClick={() => {
        setMouseNavigation(!mouseNavigation);
      }}
    />
  );
}

/**
 * Narrowest toolbar that shows all of its buttons, in pixels. In narrower
 * ones, only the buttons for navigating, and those specific to the toolbar,
 * are shown, since the menu has the others.
 *
 * The same for every toolbar, even with fewer buttons, so that they don't
 * get crowded, and change at the same widths.
 */
const MIN_FULL_WIDTH = 840;

/**
 * Narrowest toolbar that shows buttons other than the slide number and those
 * at its end, like the menu, in pixels.
 */
const MIN_REDUCED_WIDTH = 640;

/** Which buttons fit into a toolbar. */
export interface ToolbarFit {
  /**
   * Whether only the buttons for navigating, and those specific to the
   * toolbar, fit, since the menu has the others.
   */
  reduced: boolean;
  /** Whether only the slide number fits, since the menu has the actions. */
  compact: boolean;
}

/**
 * Returns which buttons fit into a toolbar that is `width` wide, or into the
 * title bar `titleBar`, next to the window controls and the title.
 */
export function fitToolbar(
  width: number,
  titleBar: TitleBar | undefined,
): ToolbarFit {
  const available =
    titleBar === undefined
      ? width
      : width - titleBar.left - titleBar.right - TITLE_WIDTH;
  return {
    reduced: available < MIN_FULL_WIDTH,
    compact: available < MIN_REDUCED_WIDTH,
  };
}
