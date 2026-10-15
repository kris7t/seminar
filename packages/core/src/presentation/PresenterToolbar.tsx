import GridViewIcon from '@mui/icons-material/GridView';
import KeyboardDoubleArrowLeftIcon from '@mui/icons-material/KeyboardDoubleArrowLeft';
import KeyboardDoubleArrowRightIcon from '@mui/icons-material/KeyboardDoubleArrowRight';
import NavigateBeforeIcon from '@mui/icons-material/NavigateBefore';
import NavigateNextIcon from '@mui/icons-material/NavigateNext';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import SpeakerNotesIcon from '@mui/icons-material/SpeakerNotes';
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
  useState,
  type ComponentType,
  type JSX,
  type ReactNode,
} from 'react';

import { useDeck } from '../deck/DeckContext.ts';

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
      sx={pressed === true ? { bgcolor: 'action.selected' } : {}}
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
}

/**
 * Toolbar of the presenter view with slide controls, the time elapsed since
 * the presentation started, and the current time.
 *
 * The time elapsed counts from when the toolbar is shown, i.e., when the
 * presenter view opens, and can be reset.
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
}: PresenterToolbarProps): JSX.Element {
  const deck = useDeck();
  const { slideIndex, slideCount } = deck;
  const [start, setStart] = useState(Date.now);
  const now = useNow(start);
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
        />
        <Tooltip title="Go to slide (G)">
          <Button
            color="inherit"
            onClick={onGoToSlide}
            sx={{ minWidth: 72, fontVariantNumeric: 'tabular-nums' }}
          >
            {slideIndex + 1} / {slideCount}
          </Button>
        </Tooltip>
        <ToolButton
          label="Next step"
          shortcut="Right"
          icon={NavigateNextIcon}
          onClick={deck.next}
        />
        <ToolButton
          label="Next slide"
          shortcut="PgDn"
          icon={KeyboardDoubleArrowRightIcon}
          onClick={deck.nextSlide}
          disabled={slideIndex === slideCount - 1}
        />
        <ToolButton
          label="Slide overview"
          shortcut="O"
          icon={GridViewIcon}
          onClick={() => {
            deck.setShowOverview(true);
          }}
        />
        <ToolButton
          label="Focus on notes"
          shortcut="N"
          icon={SpeakerNotesIcon}
          pressed={notesOnly}
          onClick={() => {
            setNotesOnly(!notesOnly);
          }}
        />
      </Group>
      <Group>
        <Typography
          aria-label="Time elapsed"
          sx={{ fontVariantNumeric: 'tabular-nums' }}
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
            mr: 1,
            color: 'text.secondary',
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {CLOCK_FORMAT.format(now)}
        </Typography>
      </Group>
    </Box>
  );
}
