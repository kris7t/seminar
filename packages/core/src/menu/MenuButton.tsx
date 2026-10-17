import { Box, IconButton } from '@mui/material';
import type { JSX } from 'react';

import { useT } from '../i18n/UiLanguageContext.ts';
import type { MenuPosition } from '../interaction/useContextMenu.ts';
import { useFullscreen } from '../presentation/useFullscreen.ts';

export interface MenuButtonProps {
  /** Whether the menu is open. */
  open: boolean;
  /** Opens the menu at a position. */
  onOpen: (position: MenuPosition) => void;
}

/** Path of the `MoreVert` icon of MUI. */
const ICON_PATH =
  'M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2m0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2m0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2';

const ICON_MASK = `url("data:image/svg+xml,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="${ICON_PATH}"/></svg>`,
)}")`;

/**
 * Button in the top right corner of the window that opens the context menu of
 * the deck, for those who don't know about right-clicking.
 *
 * It usually falls on the black bar next to the slide, but it may also fall on
 * the slide. To stay visible on any background, the icon inverts the lightness
 * of what's behind it, but keeps its hue, so it's white on the black bar,
 * black on a white slide, and light blue on a dark blue slide. Mid-gray
 * backgrounds are an exception, since inverting doesn't change them much.
 *
 * Hidden in full screen, which is how slides are shown to the audience.
 *
 * Should be rendered with the {@link uiTheme}.
 */
export function MenuButton({
  open,
  onOpen,
}: MenuButtonProps): JSX.Element | null {
  const t = useT();
  const fullscreen = useFullscreen();
  if (fullscreen) {
    return null;
  }
  return (
    <IconButton
      aria-label={t('menu')}
      aria-haspopup="menu"
      aria-expanded={open}
      onClick={(event) => {
        const button = event.currentTarget;
        const { bottom, right } = button.getBoundingClientRect();
        // Otherwise, closing the menu would focus the button, and pressing
        // Space or Enter to go to the next step would open the menu again.
        button.blur();
        onOpen({ top: bottom, left: right, align: 'right' });
      }}
      sx={{
        position: 'fixed',
        top: 8,
        right: 8,
      }}
    >
      {/*
       * Blend modes can't keep the hue, so we filter the backdrop instead,
       * masked to the shape of the icon. Rotating the hue by half a turn after
       * inverting restores it approximately.
       */}
      <Box
        component="span"
        sx={{
          width: 24,
          height: 24,
          backdropFilter: 'invert(1) hue-rotate(180deg)',
          mask: `${ICON_MASK} center / contain no-repeat`,
        }}
      />
    </IconButton>
  );
}
