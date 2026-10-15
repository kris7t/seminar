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
  useMediaQuery,
  type SvgIconProps,
} from '@mui/material';
import {
  useEffect,
  useState,
  type ComponentType,
  type JSX,
  type ReactNode,
} from 'react';

import { useDeck } from '../deck/DeckContext.ts';
import type { MenuPosition } from '../interaction/useContextMenu.ts';
import type { PointerMode } from './pointer.tsx';

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
 * Narrowest viewport that shows all buttons of the toolbar, in pixels. In
 * narrower ones, only the buttons for navigating and the settings of the
 * presenter view are shown, since the menu has the others.
 */
const MIN_FULL_TOOLBAR_WIDTH = 800;

/**
 * Narrowest viewport that shows buttons other than the menu in the toolbar, in
 * pixels. In narrower ones, the actions are only in the menu.
 */
const MIN_REDUCED_TOOLBAR_WIDTH = 640;

function narrowerThan(width: number): string {
  return `(max-width: ${String(width - 0.05)}px)`;
}

const CLOCK_FORMAT = new Intl.DateTimeFormat(undefined, {
  hour: 'numeric',
  minute: '2-digit',
});

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
    <Tooltip title={shortcut === undefined ? label : `${label} (${shortcut})`}>
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
 * The time elapsed counts from when the toolbar is shown, i.e., when the
 * presenter view opens, and can be reset.
 *
 * In narrower windows, the buttons for actions that aren't specific to the
 * presenter view are left out, and in narrow windows, only the slide number,
 * the time, and the menu button are shown, since the menu has all the actions.
 *
 * Clicking the buttons doesn't move the focus to them, so that keys like
 * Space keep navigating the slides.
 *
 * Should be rendered with the {@link darkUiTheme}.
 */
export function PresenterToolbar({
  onGoToSlide,
  notesOnly,
  setNotesOnly,
  pointerMode,
  onMirrorPointer,
  onLaserPointer,
  menuOpen,
  onOpenMenu,
}: PresenterToolbarProps): JSX.Element {
  const deck = useDeck();
  const {
    slideIndex,
    slideCount,
    atFirstStep,
    atLastStep,
    toc,
    showToc,
    setShowToc,
    mouseNavigation,
    setMouseNavigation,
  } = deck;
  const [start, setStart] = useState(Date.now);
  const now = useNow(start);
  const reduced = useMediaQuery(narrowerThan(MIN_FULL_TOOLBAR_WIDTH));
  const compact = useMediaQuery(narrowerThan(MIN_REDUCED_TOOLBAR_WIDTH));
  const slideNumber = (
    <Tooltip title="Go to slide (G)">
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
      aria-label="Presenter controls"
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
        overflowX: 'auto',
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
            label="Previous slide"
            shortcut="PgUp"
            icon={KeyboardDoubleArrowLeftIcon}
            onClick={deck.previousSlide}
            disabled={slideIndex === 0}
          />
          <ToolButton
            label="Previous step"
            shortcut="Left"
            icon={NavigateBeforeIcon}
            onClick={deck.previous}
            disabled={slideIndex === 0 && atFirstStep}
          />
          {slideNumber}
          <ToolButton
            label="Next step"
            shortcut="Right"
            icon={NavigateNextIcon}
            onClick={deck.next}
            disabled={slideIndex === slideCount - 1 && atLastStep}
          />
          <ToolButton
            label="Next slide"
            shortcut="PgDn"
            icon={KeyboardDoubleArrowRightIcon}
            onClick={deck.nextSlide}
            disabled={slideIndex === slideCount - 1}
          />
          {!reduced && (
            <>
              <ToolButton
                label="Slide overview"
                shortcut="O"
                icon={GridViewIcon}
                onClick={() => {
                  deck.setShowOverview(true);
                }}
              />
              <ToolButton
                label="Table of contents"
                shortcut="T"
                icon={TocIcon}
                pressed={showToc}
                disabled={toc.length === 0}
                onClick={() => {
                  setShowToc(!showToc);
                }}
              />
            </>
          )}
          <ToolButton
            label="Focus on notes"
            shortcut="N"
            icon={SpeakerNotesIcon}
            pressed={notesOnly}
            onClick={() => {
              setNotesOnly(!notesOnly);
            }}
          />
          <ToolButton
            label="Show pointer to the audience"
            shortcut="M"
            icon={MouseIcon}
            pressed={pointerMode === 'mirror'}
            onClick={onMirrorPointer}
          />
          <ToolButton
            label="Laser pointer"
            shortcut="L"
            icon={FlareIcon}
            pressed={pointerMode === 'laser'}
            onClick={onLaserPointer}
          />
          {!reduced && (
            <ToolButton
              label="Text selection"
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
          aria-label="Time elapsed"
          sx={{ fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}
        >
          {formatElapsed(now - start)}
        </Typography>
        <ToolButton
          label="Reset time elapsed"
          icon={RestartAltIcon}
          onClick={() => {
            setStart(Date.now());
          }}
        />
        <Typography
          aria-label="Current time"
          sx={{
            ml: 2,
            color: 'text.secondary',
            fontVariantNumeric: 'tabular-nums',
            whiteSpace: 'nowrap',
          }}
        >
          {CLOCK_FORMAT.format(now)}
        </Typography>
        <Tooltip title="Menu">
          <IconButton
            aria-label="Menu"
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
