import AutoAwesomeMotionIcon from '@mui/icons-material/AutoAwesomeMotion';
import CancelPresentationIcon from '@mui/icons-material/CancelPresentation';
import CheckIcon from '@mui/icons-material/Check';
import SettingsBackupRestoreIcon from '@mui/icons-material/SettingsBackupRestore';
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
import TranslateIcon from '@mui/icons-material/Translate';
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
import {
  useState,
  type ComponentType,
  type JSX,
  type MouseEvent,
  type ReactNode,
} from 'react';

import { useDeck } from '../deck/DeckContext.ts';
import { formatShortcut, languageName } from '../i18n/messages.ts';
import { useUiLanguage } from '../i18n/UiLanguageContext.ts';
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
  /** A value shown after the label, like the chosen language. */
  detail?: string;
  /** The language of the {@link detail}. */
  detailLang?: string;
  icon: ComponentType<SvgIconProps>;
  shortcut?: string;
  action: (event: MouseEvent<HTMLElement>) => void;
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
  const { lang: uiLang, t, locales, setLang } = useUiLanguage();
  // Where the menu of the languages is open, if it is.
  const [languagesAt, setLanguagesAt] = useState<MenuPosition>();
  const fullscreen = useFullscreen();
  const presenting = fullscreen || presenterView;
  const deck = useDeck();
  const {
    slideIndex,
    atFirstStep,
    atLastStep,
    nextSlideIndex,
    previousSlideIndex,
    firstSlideIndex,
    lastSlideIndex,
    mouseNavigation,
    setMouseNavigation,
    toc,
    showToc,
    setShowToc,
    showSteps,
    setShowSteps,
    stateChanged,
  } = deck;
  // Touch screens have no keyboard shortcuts, and a menu at the finger would
  // be partly hidden by it.
  const asDialog = useMediaQuery(COARSE_POINTER_QUERY);
  const showShortcuts = !asDialog;
  const isFirstSlide = previousSlideIndex === undefined;
  const isLastSlide = nextSlideIndex === undefined;
  const atStart = isFirstSlide && atFirstStep;
  const atEnd = isLastSlide && atLastStep;

  const groups: Item[][] = [
    [
      presenting
        ? {
            label: t('stopPresentation'),
            icon: CancelPresentationIcon,
            shortcut: 'P',
            action: onPresent,
          }
        : {
            label: t('startPresentation'),
            icon: SlideshowIcon,
            shortcut: 'P',
            action: onPresent,
          },
      {
        label: t('presenterView'),
        icon: CoPresentIcon,
        shortcut: 'Shift+P',
        action: onPresenterView,
        checked: presenterView,
      },
    ],
    [
      {
        label: t('nextStep'),
        icon: NavigateNextIcon,
        shortcut: 'Right',
        action: deck.next,
        disabled: atEnd,
      },
      {
        label: t('previousStep'),
        icon: NavigateBeforeIcon,
        shortcut: 'Left',
        action: deck.previous,
        disabled: atStart,
      },
    ],
    // The current slide.
    [
      {
        label: t('firstStep'),
        icon: SkipPreviousIcon,
        shortcut: 'Shift+Home',
        action: deck.firstStep,
        disabled: atFirstStep,
      },
      {
        label: t('lastStep'),
        icon: SkipNextIcon,
        shortcut: 'Shift+End',
        action: deck.lastStep,
        disabled: atLastStep,
      },
      {
        label: t('resetSlide'),
        icon: SettingsBackupRestoreIcon,
        action: () => {
          deck.resetSlide(slideIndex);
        },
        disabled: stateChanged[slideIndex] !== true,
      },
    ],
    [
      {
        label: t('nextSlide'),
        icon: KeyboardDoubleArrowRightIcon,
        shortcut: 'PgDn',
        action: deck.nextSlide,
        disabled: isLastSlide,
      },
      {
        label: t('previousSlide'),
        icon: KeyboardDoubleArrowLeftIcon,
        shortcut: 'PgUp',
        action: deck.previousSlide,
        disabled: isFirstSlide,
      },
      {
        label: t('firstSlide'),
        icon: FirstPageIcon,
        shortcut: 'Home',
        action: () => {
          deck.goTo(firstSlideIndex);
        },
        disabled: slideIndex === firstSlideIndex && atFirstStep,
      },
      {
        label: t('lastSlide'),
        icon: LastPageIcon,
        shortcut: 'End',
        action: () => {
          deck.goTo(lastSlideIndex, 'end');
        },
        disabled: slideIndex === lastSlideIndex && atLastStep,
      },
    ],
    [
      {
        label: t('goToSlideEllipsis'),
        icon: TagIcon,
        shortcut: 'G',
        action: onGoToSlide,
      },
      {
        label: t('slideOverview'),
        icon: GridViewIcon,
        shortcut: 'O',
        action: () => {
          deck.setShowOverview(!deck.showOverview);
        },
      },
      {
        label: t('tableOfContents'),
        icon: TocIcon,
        shortcut: 'T',
        action: () => {
          setShowToc(!showToc);
        },
        disabled: toc.length === 0,
        checked: showToc,
      },
      {
        label: t('steps'),
        icon: AutoAwesomeMotionIcon,
        shortcut: 'Shift+T',
        action: () => {
          setShowSteps(!showSteps);
        },
        checked: showSteps,
      },
    ],
    ...(presenterSettings === undefined
      ? []
      : [
          [
            {
              label: t('focusOnNotes'),
              icon: SpeakerNotesIcon,
              shortcut: 'N',
              action: presenterSettings.onFocusNotes,
              checked: presenterSettings.notesOnly,
            },
            {
              label: t('showPointer'),
              icon: MouseIcon,
              shortcut: 'M',
              action: presenterSettings.onMirrorPointer,
              checked: presenterSettings.pointerMode === 'mirror',
            },
            {
              label: t('laserPointer'),
              icon: FlareIcon,
              shortcut: 'L',
              action: presenterSettings.onLaserPointer,
              checked: presenterSettings.pointerMode === 'laser',
            },
            {
              label: t('resetTimeElapsed'),
              icon: RestartAltIcon,
              shortcut: 'R',
              action: presenterSettings.onResetTimer,
            },
          ],
        ]),
    [
      {
        label: t('textSelection'),
        icon: HighlightAltIcon,
        shortcut: 'S',
        action: () => {
          setMouseNavigation(!mouseNavigation);
        },
        checked: !mouseNavigation,
      },
    ],
    // The language of the user interface, if the deck offers several, which
    // are chosen from a menu of their own.
    locales.length > 1
      ? [
          {
            label: t('language'),
            icon: TranslateIcon,
            detail: languageName(uiLang),
            detailLang: uiLang,
            action: (event: MouseEvent<HTMLElement>) => {
              // At the pointer, or at the item if chosen with the keyboard.
              const { left, right, top } =
                event.currentTarget.getBoundingClientRect();
              setLanguagesAt(
                event.detail > 0
                  ? { top: event.clientY, left: event.clientX }
                  : { top, left: Math.min(right, left + 160) },
              );
            },
          },
        ]
      : [],
  ].filter((group) => group.length > 0);

  const items = groups.flatMap((group, i) => [
    ...(i > 0 ? [<Divider key={`divider-${String(i)}`} />] : []),
    ...group.map(
      ({
        label,
        detail,
        detailLang,
        icon: Icon,
        shortcut,
        action,
        disabled = false,
        checked,
      }) => (
        <MenuItem
          key={label}
          disabled={disabled}
          {...(checked === undefined
            ? {}
            : { role: 'menuitemcheckbox', 'aria-checked': checked })}
          onClick={(event) => {
            onClose();
            action(event);
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
          {detail !== undefined && (
            <Typography
              variant="body2"
              color="textSecondary"
              lang={detailLang}
              sx={{ ml: 3 }}
            >
              {detail}
            </Typography>
          )}
          {showShortcuts && shortcut !== undefined && (
            <Shortcut>{formatShortcut(t, shortcut)}</Shortcut>
          )}
        </MenuItem>
      ),
    ),
  ]);

  const languageItems = locales.map(({ lang }) => (
    <MenuItem
      key={lang}
      role="menuitemradio"
      aria-checked={lang === uiLang}
      onClick={() => {
        setLanguagesAt(undefined);
        setLang(lang);
      }}
    >
      <ItemIcon>{lang === uiLang && <CheckIcon fontSize="small" />}</ItemIcon>
      {/* Each language is named in itself. */}
      <ListItemText lang={lang}>{languageName(lang)}</ListItemText>
    </MenuItem>
  ));

  return (
    <>
      <MenuSurface
        position={anchorPosition}
        onClose={onClose}
        asDialog={asDialog}
        label={t('menu')}
        lang={uiLang}
      >
        {items}
      </MenuSurface>
      <MenuSurface
        position={languagesAt}
        onClose={() => {
          setLanguagesAt(undefined);
        }}
        asDialog={asDialog}
        label={t('language')}
        lang={uiLang}
      >
        {languageItems}
      </MenuSurface>
    </>
  );
}

interface MenuSurfaceProps {
  /** Where the menu is open, or `undefined` if it's closed. */
  position: MenuPosition | undefined;
  onClose: () => void;
  /** Whether to show the menu as a dialog, e.g., on touch screens. */
  asDialog: boolean;
  label: string;
  lang: string;
  children: ReactNode;
}

/** A menu at `position`, or a dialog in the middle of the screen. */
function MenuSurface({
  position,
  onClose,
  asDialog,
  label,
  lang,
  children,
}: MenuSurfaceProps): JSX.Element {
  const open = position !== undefined;
  if (asDialog) {
    return (
      <Dialog
        open={open}
        onClose={onClose}
        slotProps={{ paper: { 'aria-label': label, lang } }}
      >
        <MenuList autoFocusItem={open} sx={LIST_STYLES}>
          {children}
        </MenuList>
      </Dialog>
    );
  }
  return (
    <Menu
      open={open}
      onClose={onClose}
      anchorReference="anchorPosition"
      {...(position === undefined
        ? {}
        : {
            anchorPosition: { top: position.top, left: position.left },
            transformOrigin: {
              vertical: position.verticalAlign ?? 'top',
              horizontal: position.align ?? 'left',
            },
          })}
      slotProps={{
        paper: { lang },
        list: { dense: true, sx: LIST_STYLES, 'aria-label': label },
      }}
    >
      {children}
    </Menu>
  );
}
