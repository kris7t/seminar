import FlareIcon from '@mui/icons-material/Flare';
import MouseIcon from '@mui/icons-material/Mouse';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import SpeakerNotesIcon from '@mui/icons-material/SpeakerNotes';
import { Box, Typography } from '@mui/material';
import { useEffect, useMemo, useState, type JSX, type MouseEvent } from 'react';

import { useUiLanguage } from '../i18n/UiLanguageContext.ts';
import type { MenuPosition } from '../interaction/useContextMenu.ts';
import { ToolbarMenuButton } from '../menu/MenuButton.tsx';
import { TitleBar } from '../menu/TitleBar.tsx';
import {
  fitToolbar,
  NavigationButtons,
  SlideNumberButton,
  TextSelectionButton,
  ToolButton,
  ToolGroup,
  ViewButtons,
} from '../menu/toolbar.tsx';
import type { TitleBar as TitleBarArea } from '../menu/useTitleBar.ts';
import type { PointerMode } from './mirror/pointer.tsx';

/** Height of the toolbar, in pixels, and of the title bar of the window. */
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

/** Formats the time of day in the language of the user interface. */
function useClockFormat(lang: string): Intl.DateTimeFormat {
  return useMemo(
    () => new Intl.DateTimeFormat(lang, { hour: 'numeric', minute: '2-digit' }),
    [lang],
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
  /**
   * The title bar of the window, if the page draws it, which the toolbar is
   * then, with the title between its buttons, instead of being below the
   * presenter view. It spans the window.
   */
  titleBar?: { area: TitleBarArea; color: string } | undefined;
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
  titleBar,
}: PresenterToolbarProps): JSX.Element {
  const { lang, t } = useUiLanguage();
  const clockFormat = useClockFormat(lang);
  const now = useNow(start);
  const { reduced, compact } = fitToolbar(width, titleBar?.area);
  const startGroup = compact ? (
    <ToolGroup>
      <SlideNumberButton onGoToSlide={onGoToSlide} />
    </ToolGroup>
  ) : (
    <ToolGroup>
      <NavigationButtons onGoToSlide={onGoToSlide} />
      {!reduced && <ViewButtons />}
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
      {!reduced && <TextSelectionButton />}
    </ToolGroup>
  );
  const endGroup = (
    <ToolGroup>
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
      <ToolbarMenuButton
        open={menuOpen}
        onOpen={onOpenMenu}
        above={titleBar === undefined}
      />
    </ToolGroup>
  );
  const toolbar = {
    role: 'toolbar',
    'aria-label': t('presenterControls'),
    onMouseDown: (event: MouseEvent) => {
      event.preventDefault();
    },
  };
  if (titleBar !== undefined) {
    return (
      <TitleBar
        {...toolbar}
        area={titleBar.area}
        color={titleBar.color}
        // Like the line above the toolbar below the presenter view.
        divider
        start={<Box sx={{ px: 1 }}>{startGroup}</Box>}
        end={<Box sx={{ px: 1 }}>{endGroup}</Box>}
      />
    );
  }
  return (
    <Box
      {...toolbar}
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
      {startGroup}
      {endGroup}
    </Box>
  );
}
