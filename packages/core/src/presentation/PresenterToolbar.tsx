import AutoAwesomeMotionIcon from '@mui/icons-material/AutoAwesomeMotion';
import FlareIcon from '@mui/icons-material/Flare';
import GridViewIcon from '@mui/icons-material/GridView';
import HighlightAltIcon from '@mui/icons-material/HighlightAlt';
import KeyboardDoubleArrowLeftIcon from '@mui/icons-material/KeyboardDoubleArrowLeft';
import KeyboardDoubleArrowRightIcon from '@mui/icons-material/KeyboardDoubleArrowRight';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import MouseIcon from '@mui/icons-material/Mouse';
import NavigateBeforeIcon from '@mui/icons-material/NavigateBefore';
import NavigateNextIcon from '@mui/icons-material/NavigateNext';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import SpeakerNotesIcon from '@mui/icons-material/SpeakerNotes';
import TocIcon from '@mui/icons-material/Toc';
import {
  Box,
  Button,
  IconButton,
  Tooltip,
  Typography,
  type SvgIconProps,
} from '@mui/material';
import {
  useEffect,
  useMemo,
  useState,
  type ComponentType,
  type JSX,
  type ReactNode,
} from 'react';

import { useDeck } from '../deck/DeckContext.ts';
import { formatShortcut } from '../i18n/messages.ts';
import { useT, useUiLanguage } from '../i18n/UiLanguageContext.ts';
import type { MenuPosition } from '../interaction/useContextMenu.ts';
import type { PointerMode } from './mirror/pointer.tsx';

/** Height of the toolbar, in pixels. */
export const TOOLBAR_HEIGHT = 48;

/**
 * Returns the current time, updated every second, counting from `start`, so
 * that durations since `start` change in whole seconds.
 */
function useNow(start: number): number {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const interval = setInterval(() => {
      setNow(Date.now());
    }, 1000);
    return () => {
      clearInterval(interval);
    };
  }, [start]);
  return Math.max(now, start);
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

/** Formats a duration in milliseconds as `m:ss` or `h:mm:ss`. */
export function formatElapsed(milliseconds: number): string {
  const total = Math.max(Math.floor(milliseconds / 1000), 0);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  return hours > 0
    ? `${String(hours)}:${pad(minutes)}:${pad(seconds)}`
    : `${String(minutes)}:${pad(seconds)}`;
}

/**
 * Narrowest toolbar that shows all of its buttons, in pixels. In narrower
 * ones, only the buttons for navigating and the settings of the
 * presenter view are shown, since the menu has the others.
 */
const MIN_FULL_TOOLBAR_WIDTH = 840;

/**
 * Narrowest toolbar that shows buttons other than the menu, in pixels. In
 * narrower ones, the actions are only in the menu.
 */
const MIN_REDUCED_TOOLBAR_WIDTH = 640;

/** Formats the time of day in the language of the user interface. */
function useClockFormat(lang: string): Intl.DateTimeFormat {
  return useMemo(
    () => new Intl.DateTimeFormat(lang, { hour: 'numeric', minute: '2-digit' }),
    [lang],
  );
}

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

function ToolButton({
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

function Group({ children }: { children: ReactNode }): JSX.Element {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
      {children}
    </Box>
  );
}

export interface PresenterToolbarProps {
  /**
   * Width of the toolbar, in pixels, which decides which buttons fit. It's the
   * width of the presenter view, which other parts of the window, like the
   * table of contents, may leave narrower than the window.
   */
  width: number;
  /**
   * When to count the time elapsed from, in milliseconds since the epoch,
   * e.g., when the presenter view was opened.
   */
  timerStart: number;
  /** Resets the time elapsed. */
  onResetTimer: () => void;
  /** Opens the dialog for going to a slide by number. */
  onGoToSlide: () => void;
  /** Whether the panel shows only the notes. */
  notesOnly: boolean;
  setNotesOnly: (notesOnly: boolean) => void;
  /** How the pointer of the presenter is shown to the audience. */
  pointerMode: PointerMode;
  /** Shows or hides the pointer to the audience. */
  onMirrorPointer: () => void;
  /** Turns the pointer into a laser pointer, or back. */
  onLaserPointer: () => void;
  /** Whether the menu is open. */
  menuOpen: boolean;
  /** Opens the menu of the deck at a position. */
  onOpenMenu: (position: MenuPosition) => void;
}

/**
 * Toolbar of the presenter view with slide controls, the time elapsed since
 * the presentation started, and the current time.
 *
 * The time elapsed counts from `timerStart`, e.g., when the presenter view
 * opened, or when it was last reset.
 *
 * In a narrower presenter view, the buttons for actions that aren't specific to
 * it are left out, and in a narrow one, only the slide number, the time, and
 * the menu button are shown, since the menu has all the actions.
 *
 * Clicking the buttons doesn't move the focus to them, so that keys like
 * Space keep navigating the slides.
 *
 * Should be rendered with the {@link darkUiTheme}.
 */
export function PresenterToolbar({
  width,
  timerStart: start,
  onResetTimer,
  onGoToSlide,
  notesOnly,
  setNotesOnly,
  pointerMode,
  onMirrorPointer,
  onLaserPointer,
  menuOpen,
  onOpenMenu,
}: PresenterToolbarProps): JSX.Element {
  const { lang, t } = useUiLanguage();
  const clockFormat = useClockFormat(lang);
  const deck = useDeck();
  const {
    slideIndex,
    slideCount,
    atFirstStep,
    atLastStep,
    nextSlideIndex,
    previousSlideIndex,
    toc,
    showToc,
    setShowToc,
    showSteps,
    setShowSteps,
    mouseNavigation,
    setMouseNavigation,
  } = deck;
  const now = useNow(start);
  const reduced = width < MIN_FULL_TOOLBAR_WIDTH;
  const compact = width < MIN_REDUCED_TOOLBAR_WIDTH;
  const slideNumber = (
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
  return (
    <Box
      role="toolbar"
      aria-label={t('presenterControls')}
      onMouseDown={(event) => {
        event.preventDefault();
      }}
      sx={{
        flex: 'none',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 2,
        height: TOOLBAR_HEIGHT,
        px: 1,
        // The buttons are chosen to fit, so this only clips them until the
        // width is measured, without a scrollbar flashing.
        overflow: 'hidden',
        bgcolor: 'background.default',
        color: 'text.primary',
        borderTop: 1,
        borderColor: 'divider',
      }}
    >
      {compact ? (
        <Group>{slideNumber}</Group>
      ) : (
        <Group>
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
          {slideNumber}
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
          {!reduced && (
            <>
              <ToolButton
                label={t('slideOverview')}
                shortcut="O"
                icon={GridViewIcon}
                onClick={() => {
                  deck.setShowOverview(true);
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
          )}
          <ToolButton
            label={t('focusOnNotes')}
            shortcut="N"
            icon={SpeakerNotesIcon}
            pressed={notesOnly}
            onClick={() => {
              setNotesOnly(!notesOnly);
            }}
          />
          <ToolButton
            label={t('showPointer')}
            shortcut="M"
            icon={MouseIcon}
            pressed={pointerMode === 'mirror'}
            onClick={onMirrorPointer}
          />
          <ToolButton
            label={t('laserPointer')}
            shortcut="L"
            icon={FlareIcon}
            pressed={pointerMode === 'laser'}
            onClick={onLaserPointer}
          />
          {!reduced && (
            <ToolButton
              label={t('textSelection')}
              shortcut="S"
              icon={HighlightAltIcon}
              pressed={!mouseNavigation}
              onClick={() => {
                setMouseNavigation(!mouseNavigation);
              }}
            />
          )}
        </Group>
      )}
      <Group>
        <Typography
          aria-label={t('timeElapsed')}
          sx={{ fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}
        >
          {formatElapsed(now - start)}
        </Typography>
        <ToolButton
          label={t('resetTimeElapsed')}
          shortcut="R"
          icon={RestartAltIcon}
          onClick={onResetTimer}
        />
        <Typography
          aria-label={t('currentTime')}
          sx={{
            ml: 2,
            color: 'text.secondary',
            fontVariantNumeric: 'tabular-nums',
            whiteSpace: 'nowrap',
          }}
        >
          {clockFormat.format(now)}
        </Typography>
        <Tooltip title={t('menu')}>
          <IconButton
            aria-label={t('menu')}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            color="inherit"
            onClick={(event) => {
              const { top, right } =
                event.currentTarget.getBoundingClientRect();
              onOpenMenu({
                top,
                left: right,
                align: 'right',
                verticalAlign: 'bottom',
              });
            }}
          >
            <MoreVertIcon />
          </IconButton>
        </Tooltip>
      </Group>
    </Box>
  );
}
