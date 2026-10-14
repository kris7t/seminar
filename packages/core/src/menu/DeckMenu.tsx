import CheckIcon from '@mui/icons-material/Check';
import FirstPageIcon from '@mui/icons-material/FirstPage';
import KeyboardDoubleArrowLeftIcon from '@mui/icons-material/KeyboardDoubleArrowLeft';
import KeyboardDoubleArrowRightIcon from '@mui/icons-material/KeyboardDoubleArrowRight';
import LastPageIcon from '@mui/icons-material/LastPage';
import NavigateBeforeIcon from '@mui/icons-material/NavigateBefore';
import NavigateNextIcon from '@mui/icons-material/NavigateNext';
import SkipNextIcon from '@mui/icons-material/SkipNext';
import SkipPreviousIcon from '@mui/icons-material/SkipPrevious';
import TagIcon from '@mui/icons-material/Tag';
import {
  Divider,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Typography,
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

function ItemIcon({ children }: { children?: ReactNode }): JSX.Element {
  return <ListItemIcon>{children}</ListItemIcon>;
}

/**
 * Context menu of the deck with navigation actions and settings.
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
          deck.goTo(slideCount - 1);
        },
      },
      {
        label: 'Go to slide…',
        icon: TagIcon,
        shortcut: ':',
        action: onGoToSlide,
      },
    ],
  ];

  return (
    <Menu
      open={anchorPosition !== undefined}
      onClose={onClose}
      anchorReference="anchorPosition"
      {...(anchorPosition === undefined ? {} : { anchorPosition })}
      slotProps={{
        list: {
          dense: true,
          sx: {
            minWidth: 220,
            '& .MuiMenuItem-root': { pl: 1.5 },
            // MenuItem sets the width of the icon with a selector of the
            // same form, so we need to be at least as specific.
            '& .MuiMenuItem-root .MuiListItemIcon-root': {
              minWidth: ICON_WIDTH,
            },
          },
        },
      }}
    >
      {groups.flatMap((group, i) => [
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
              {shortcut !== undefined && (
                <Typography
                  variant="body2"
                  color="textSecondary"
                  sx={{ ml: 3 }}
                >
                  {shortcut}
                </Typography>
              )}
            </MenuItem>
          ),
        ),
      ])}
      <Divider />
      <MenuItem
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
      </MenuItem>
      <MenuItem
        role="menuitemcheckbox"
        aria-checked={!mouseNavigation}
        onClick={() => {
          onClose();
          setMouseNavigation(!mouseNavigation);
        }}
      >
        <ItemIcon>
          {!mouseNavigation && <CheckIcon fontSize="small" />}
        </ItemIcon>
        <ListItemText>Text selection</ListItemText>
      </MenuItem>
    </Menu>
  );
}
