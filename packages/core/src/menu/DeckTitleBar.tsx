import SlideshowIcon from '@mui/icons-material/Slideshow';
import { Box } from '@mui/material';
import type { JSX, MouseEvent } from 'react';

import { useT } from '../i18n/UiLanguageContext.ts';
import type { MenuPosition } from '../interaction/useContextMenu.ts';
import { ToolbarMenuButton } from './MenuButton.tsx';
import { TitleBar } from './TitleBar.tsx';
import {
  fitToolbar,
  NavigationButtons,
  SlideNumberButton,
  TextSelectionButton,
  ToolButton,
  ToolGroup,
  ViewButtons,
} from './toolbar.tsx';
import type { TitleBar as TitleBarArea } from './useTitleBar.ts';

export interface DeckTitleBarProps {
  area: TitleBarArea;
  /** The background color, which the window controls are drawn on, too. */
  color: string;
  /** Whether a line separates the title bar from what's below. */
  divider: boolean;
  /** Opens the dialog for going to a slide by number. */
  onGoToSlide: () => void;
  /** Starts the presentation. */
  onPresent: () => void;
  /** Whether the menu is open. */
  menuOpen: boolean;
  /** Opens the menu of the deck at a position. */
  onOpenMenu: (position: MenuPosition) => void;
}

/**
 * Title bar of the window of a deck, if the page draws it, outside of the
 * presenter view, with buttons for navigating and showing the overview and
 * the sidebar, which are left out like in the toolbar of the presenter view
 * if they don't fit (see `PresenterToolbar`), and for starting the
 * presentation. The window doesn't draw its title bar in full screen, so the
 * presentation can't be stopped from it.
 *
 * Clicking the buttons doesn't move the focus to them, so that keys like
 * Space keep navigating the slides.
 *
 * Should be rendered with the {@link darkUiTheme}.
 */
export function DeckTitleBar({
  area,
  color,
  divider,
  onGoToSlide,
  onPresent,
  menuOpen,
  onOpenMenu,
}: DeckTitleBarProps): JSX.Element {
  const t = useT();
  const { reduced, compact } = fitToolbar(area.width, area);
  return (
    <TitleBar
      area={area}
      color={color}
      divider={divider}
      onMouseDown={(event: MouseEvent) => {
        event.preventDefault();
      }}
      start={
        <Box sx={{ px: 1 }}>
          <ToolGroup>
            {compact ? (
              <SlideNumberButton onGoToSlide={onGoToSlide} />
            ) : (
              <>
                <NavigationButtons onGoToSlide={onGoToSlide} />
                {!reduced && (
                  <>
                    <ViewButtons />
                    <TextSelectionButton />
                  </>
                )}
              </>
            )}
          </ToolGroup>
        </Box>
      }
      end={
        <Box sx={{ px: 1 }}>
          <ToolGroup>
            <ToolButton
              label={t('startPresentation')}
              shortcut="P"
              icon={SlideshowIcon}
              onClick={onPresent}
            />
            <ToolbarMenuButton open={menuOpen} onOpen={onOpenMenu} />
          </ToolGroup>
        </Box>
      }
    />
  );
}
