import CancelPresentationIcon from '@mui/icons-material/CancelPresentation';
import CheckIcon from '@mui/icons-material/Check';
import CoPresentIcon from '@mui/icons-material/CoPresent';
import FirstPageIcon from '@mui/icons-material/FirstPage';
import FlareIcon from '@mui/icons-material/Flare';
import GridViewIcon from '@mui/icons-material/GridView';
import HighlightAltIcon from '@mui/icons-material/HighlightAlt';
import KeyboardDoubleArrowLeftIcon from '@mui/icons-material/KeyboardDoubleArrowLeft';
import KeyboardDoubleArrowRightIcon from '@mui/icons-material/KeyboardDoubleArrowRight';
import LastPageIcon from '@mui/icons-material/LastPage';
import MouseIcon from '@mui/icons-material/Mouse';
import NavigateBeforeIcon from '@mui/icons-material/NavigateBefore';
import NavigateNextIcon from '@mui/icons-material/NavigateNext';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import SkipNextIcon from '@mui/icons-material/SkipNext';
import SkipPreviousIcon from '@mui/icons-material/SkipPrevious';
import SlideshowIcon from '@mui/icons-material/Slideshow';
import SpeakerNotesIcon from '@mui/icons-material/SpeakerNotes';
import TagIcon from '@mui/icons-material/Tag';
import TocIcon from '@mui/icons-material/Toc';
import {
  Dialog,
  Divider,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  MenuList,
  Typography,
  useMediaQuery,
  type SvgIconProps,
} from '@mui/material';
import type { ComponentType, JSX, ReactNode } from 'react';

import { useDeck } from '../deck/DeckContext.ts';
import type { MenuPosition } from '../interaction/useContextMenu.ts';
import { useFullscreen } from '../notes/useFullscreen.ts';
import type { PointerMode } from '../presentation/pointer.tsx';

/** Settings of the presenter view, shown in the menu while it's open. */
export interface PresenterSettings {
  /** Whether the presenter view shows only the notes. */
  notesOnly: boolean;
  onFocusNotes: () => void;
  pointerMode: PointerMode;
  onMirrorPointer: () => void;
  onLaserPointer: () => void;
  /** Resets the time elapsed. */
  onResetTimer: () => void;
}

export interface DeckMenuProps {
  /** Position of the menu, or `undefined` if the menu is closed. */
  anchorPosition: MenuPosition | undefined;
  onClose: () => void;
  /** Opens the dialog for going to a slide by number. */
  onGoToSlide: () => void;
  /** Starts or stops the presentation. */
  onPresent: () => void;
  /** Whether the presenter view is open. */
  presenterView: boolean;
  /** Opens or closes the presenter view. */
  onPresenterView: () => void;
  /** Settings of the presenter view, if it's open. */
  presenterSettings?: PresenterSettings | undefined;
}

interface Item {
  label: string;
  icon: ComponentType<SvgIconProps>;
  shortcut?: string;
  action: () => void;
  disabled?: boolean;
  /**
   * Whether the setting toggled by the item is on, if it's a toggle. Items of
   * settings that are on show a checkmark instead of their icon.
   */
  checked?: boolean;
}

/**
 * Width of the icon column, narrower than the MUI default of 36px, since the
 * small icons are 20px wide and have some padding of their own.
 */
const ICON_WIDTH = 28;

/** Matches if the primary pointer is a finger, like on mobile devices. */
const COARSE_POINTER_QUERY = '(pointer: coarse)';

const LIST_STYLES = {
  minWidth: 220,
  '& .MuiMenuItem-root': { pl: 1.5 },
  // MenuItem sets the width of the icon with a selector of the same form, so
  // we need to be at least as specific.
  '& .MuiMenuItem-root .MuiListItemIcon-root': { minWidth: ICON_WIDTH },
} as const;

/**
 * The keyboard shortcut of a menu item. It's hidden from assistive technology,
 * since it would become part of the name of the item.
 */
function Shortcut({ children }: { children: ReactNode }): JSX.Element {
  return (
    <Typography
      variant="body2"
      color="textSecondary"
      aria-hidden
      sx={{ ml: 3 }}
    >
      {children}
    </Typography>
  );
}

function ItemIcon({ children }: { children?: ReactNode }): JSX.Element {
  return <ListItemIcon>{children}</ListItemIcon>;
}

/**
 * Context menu of the deck with navigation actions and settings.
 *
 * On touch screens, it is shown as a dialog in the middle of the screen
 * instead, without keyboard shortcuts.
 *
 * Should be rendered with the {@link uiTheme}.
 */
export function DeckMenu({
  anchorPosition,
  onClose,
  onGoToSlide,
  onPresent,
  presenterView,
  onPresenterView,
  presenterSettings,
}: DeckMenuProps): JSX.Element {
  const fullscreen = useFullscreen();
  const presenting = fullscreen || presenterView;
  const deck = useDeck();
  const {
    slideIndex,
    slideCount,
    atFirstStep,
    atLastStep,
    mouseNavigation,
    setMouseNavigation,
    toc,
    showToc,
    setShowToc,
  } = deck;
  // Touch screens have no keyboard shortcuts, and a menu at the finger would
  // be partly hidden by it.
  const asDialog = useMediaQuery(COARSE_POINTER_QUERY);
  const showShortcuts = !asDialog;
  const isFirstSlide = slideIndex === 0;
  const isLastSlide = slideIndex === slideCount - 1;
  const atStart = isFirstSlide && atFirstStep;
  const atEnd = isLastSlide && atLastStep;

  const groups: Item[][] = [
    [
      presenting
        ? {
            label: 'Stop presentation',
            icon: CancelPresentationIcon,
            shortcut: 'P',
            action: onPresent,
          }
        : {
            label: 'Start presentation',
            icon: SlideshowIcon,
            shortcut: 'P',
            action: onPresent,
          },
      {
        label: 'Presenter view',
        icon: CoPresentIcon,
        shortcut: 'Shift+P',
        action: onPresenterView,
        checked: presenterView,
      },
    ],
    [
      {
        label: 'Next step',
        icon: NavigateNextIcon,
        shortcut: 'Right',
        action: deck.next,
        disabled: atEnd,
      },
      {
        label: 'Previous step',
        icon: NavigateBeforeIcon,
        shortcut: 'Left',
        action: deck.previous,
        disabled: atStart,
      },
      {
        label: 'First step',
        icon: SkipPreviousIcon,
        shortcut: 'Shift+Home',
        action: deck.firstStep,
        disabled: atFirstStep,
      },
      {
        label: 'Last step',
        icon: SkipNextIcon,
        shortcut: 'Shift+End',
        action: deck.lastStep,
        disabled: atLastStep,
      },
    ],
    [
      {
        label: 'Next slide',
        icon: KeyboardDoubleArrowRightIcon,
        shortcut: 'PgDn',
        action: deck.nextSlide,
        disabled: isLastSlide,
      },
      {
        label: 'Previous slide',
        icon: KeyboardDoubleArrowLeftIcon,
        shortcut: 'PgUp',
        action: deck.previousSlide,
        disabled: isFirstSlide,
      },
      {
        label: 'First slide',
        icon: FirstPageIcon,
        shortcut: 'Home',
        action: () => {
          deck.goTo(0);
        },
        disabled: atStart,
      },
      {
        label: 'Last slide',
        icon: LastPageIcon,
        shortcut: 'End',
        action: () => {
          deck.goTo(slideCount - 1, 'end');
        },
        disabled: atEnd,
      },
    ],
    [
      {
        label: 'Go to slide…',
        icon: TagIcon,
        shortcut: 'G',
        action: onGoToSlide,
      },
      {
        label: 'Slide overview',
        icon: GridViewIcon,
        shortcut: 'O',
        action: () => {
          deck.setShowOverview(!deck.showOverview);
        },
      },
      {
        label: 'Table of contents',
        icon: TocIcon,
        shortcut: 'T',
        action: () => {
          setShowToc(!showToc);
        },
        disabled: toc.length === 0,
        checked: showToc,
      },
    ],
    ...(presenterSettings === undefined
      ? []
      : [
          [
            {
              label: 'Focus on notes',
              icon: SpeakerNotesIcon,
              shortcut: 'N',
              action: presenterSettings.onFocusNotes,
              checked: presenterSettings.notesOnly,
            },
            {
              label: 'Show pointer to the audience',
              icon: MouseIcon,
              shortcut: 'M',
              action: presenterSettings.onMirrorPointer,
              checked: presenterSettings.pointerMode === 'mirror',
            },
            {
              label: 'Laser pointer',
              icon: FlareIcon,
              shortcut: 'L',
              action: presenterSettings.onLaserPointer,
              checked: presenterSettings.pointerMode === 'laser',
            },
            {
              label: 'Reset time elapsed',
              icon: RestartAltIcon,
              shortcut: 'R',
              action: presenterSettings.onResetTimer,
            },
          ],
        ]),
    [
      {
        label: 'Text selection',
        icon: HighlightAltIcon,
        shortcut: 'S',
        action: () => {
          setMouseNavigation(!mouseNavigation);
        },
        checked: !mouseNavigation,
      },
    ],
  ];

  const items = groups.flatMap((group, i) => [
    ...(i > 0 ? [<Divider key={`divider-${String(i)}`} />] : []),
    ...group.map(
      ({ label, icon: Icon, shortcut, action, disabled = false, checked }) => (
        <MenuItem
          key={label}
          disabled={disabled}
          {...(checked === undefined
            ? {}
            : { role: 'menuitemcheckbox', 'aria-checked': checked })}
          onClick={() => {
            onClose();
            action();
          }}
        >
          <ItemIcon>
            {checked === true ? (
              <CheckIcon fontSize="small" />
            ) : (
              <Icon fontSize="small" />
            )}
          </ItemIcon>
          <ListItemText>{label}</ListItemText>
          {showShortcuts && shortcut !== undefined && (
            <Shortcut>{shortcut}</Shortcut>
          )}
        </MenuItem>
      ),
    ),
  ]);

  const open = anchorPosition !== undefined;
  if (asDialog) {
    return (
      <Dialog
        open={open}
        onClose={onClose}
        slotProps={{ paper: { 'aria-label': 'Menu' } }}
      >
        <MenuList autoFocusItem={open} sx={LIST_STYLES}>
          {items}
        </MenuList>
      </Dialog>
    );
  }
  return (
    <Menu
      open={open}
      onClose={onClose}
      anchorReference="anchorPosition"
      {...(anchorPosition === undefined
        ? {}
        : {
            anchorPosition: {
              top: anchorPosition.top,
              left: anchorPosition.left,
            },
            transformOrigin: {
              vertical: anchorPosition.verticalAlign ?? 'top',
              horizontal: anchorPosition.align ?? 'left',
            },
          })}
      slotProps={{ list: { dense: true, sx: LIST_STYLES } }}
    >
      {items}
    </Menu>
  );
}
