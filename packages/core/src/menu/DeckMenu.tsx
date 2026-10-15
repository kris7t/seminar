import CheckIcon from '@mui/icons-material/Check';
import FirstPageIcon from '@mui/icons-material/FirstPage';
import GridViewIcon from '@mui/icons-material/GridView';
import KeyboardDoubleArrowLeftIcon from '@mui/icons-material/KeyboardDoubleArrowLeft';
import KeyboardDoubleArrowRightIcon from '@mui/icons-material/KeyboardDoubleArrowRight';
import LastPageIcon from '@mui/icons-material/LastPage';
import NavigateBeforeIcon from '@mui/icons-material/NavigateBefore';
import NavigateNextIcon from '@mui/icons-material/NavigateNext';
import SkipNextIcon from '@mui/icons-material/SkipNext';
import SkipPreviousIcon from '@mui/icons-material/SkipPrevious';
import TagIcon from '@mui/icons-material/Tag';
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

export interface DeckMenuProps {
  /** Position of the menu, or `undefined` if the menu is closed. */
  anchorPosition: MenuPosition | undefined;
  onClose: () => void;
  /** Opens the dialog for going to a slide by number. */
  onGoToSlide: () => void;
}

interface Action {
  label: string;
  icon: ComponentType<SvgIconProps>;
  shortcut?: string;
  action: () => void;
  disabled?: boolean;
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
}: DeckMenuProps): JSX.Element {
  const deck = useDeck();
  const {
    slideIndex,
    slideCount,
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

  const groups: Action[][] = [
    [
      {
        label: 'Next step',
        icon: NavigateNextIcon,
        shortcut: 'Right',
        action: deck.next,
      },
      {
        label: 'Previous step',
        icon: NavigateBeforeIcon,
        shortcut: 'Left',
        action: deck.previous,
      },
      {
        label: 'First step',
        icon: SkipPreviousIcon,
        shortcut: 'Shift+Home',
        action: deck.firstStep,
      },
      {
        label: 'Last step',
        icon: SkipNextIcon,
        shortcut: 'Shift+End',
        action: deck.lastStep,
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
      },
      {
        label: 'Last slide',
        icon: LastPageIcon,
        shortcut: 'End',
        action: () => {
          deck.goTo(slideCount - 1, 'end');
        },
      },
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
    ],
  ];

  const items = [
    ...groups.flatMap((group, i) => [
      ...(i > 0 ? [<Divider key={`divider-${String(i)}`} />] : []),
      ...group.map(
        ({ label, icon: Icon, shortcut, action, disabled = false }) => (
          <MenuItem
            key={label}
            disabled={disabled}
            onClick={() => {
              onClose();
              action();
            }}
          >
            <ItemIcon>
              <Icon fontSize="small" />
            </ItemIcon>
            <ListItemText>{label}</ListItemText>
            {showShortcuts && shortcut !== undefined && (
              <Shortcut>{shortcut}</Shortcut>
            )}
          </MenuItem>
        ),
      ),
    ]),
    <Divider key="divider-settings" />,
    <MenuItem
      key="toc"
      role="menuitemcheckbox"
      aria-checked={showToc}
      disabled={toc.length === 0}
      onClick={() => {
        onClose();
        setShowToc(!showToc);
      }}
    >
      <ItemIcon>{showToc && <CheckIcon fontSize="small" />}</ItemIcon>
      <ListItemText>Table of contents</ListItemText>
      {showShortcuts && <Shortcut>T</Shortcut>}
    </MenuItem>,
    <MenuItem
      key="text-selection"
      role="menuitemcheckbox"
      aria-checked={!mouseNavigation}
      onClick={() => {
        onClose();
        setMouseNavigation(!mouseNavigation);
      }}
    >
      <ItemIcon>{!mouseNavigation && <CheckIcon fontSize="small" />}</ItemIcon>
      <ListItemText>Text selection</ListItemText>
    </MenuItem>,
  ];

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
              vertical: 'top',
              horizontal: anchorPosition.align ?? 'left',
            },
          })}
      slotProps={{ list: { dense: true, sx: LIST_STYLES } }}
    >
      {items}
    </Menu>
  );
}
