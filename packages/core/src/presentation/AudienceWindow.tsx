import { CacheProvider } from '@emotion/react';
import {
  Box,
  ButtonBase,
  CssBaseline,
  ThemeProvider,
  Typography,
  type Theme,
} from '@mui/material';
import {
  use,
  useCallback,
  useEffect,
  useEffectEvent,
  useState,
  useSyncExternalStore,
  type JSX,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';

import { useUiLanguage } from '../i18n/UiLanguageContext.ts';
import { useDeck } from '../deck/DeckContext.ts';
import { uiTheme } from '../menu/uiTheme.ts';
import { correctRipples } from '../slide/rippleScale.ts';
import { SlideMirror } from '../slide/SlideMirror.tsx';
import {
  getStepTransition,
  SlideTransitionsContext,
} from '../slide/SlideTransitions.ts';
import { SlideTransitionStyles } from '../slide/SlideTransitionStyles.tsx';
import { SLIDE_VIEW_ATTRIBUTE } from '../slide/SlideViewContext.ts';
import { SelectionFrame } from '../slide/SelectionFrame.tsx';
import { SLIDE_FRAME_STYLES } from '../slide/slideFrame.ts';
import { SLIDE_HEIGHT, SLIDE_WIDTH } from '../theme/createSlideTheme.ts';
import type { AudienceWindow as AudienceWindowState } from './usePresenterView.ts';
import {
  MirroredPointer,
  type PointerMode,
  type PointerStore,
} from './pointer.tsx';
import { InteractionMirror } from './mirror/InteractionMirror.tsx';
import type { InteractionStore } from './mirror/interactionState.ts';
import { enterFullscreen } from './screens.ts';

function useFitScale(target: Window): number {
  const subscribe = useCallback(
    (listener: () => void) => {
      target.addEventListener('resize', listener);
      return () => {
        target.removeEventListener('resize', listener);
      };
    },
    [target],
  );
  return useSyncExternalStore(subscribe, () =>
    Math.min(
      target.innerWidth / SLIDE_WIDTH,
      target.innerHeight / SLIDE_HEIGHT,
    ),
  );
}

function isFullscreen(doc: Document): boolean {
  // Missing in environments without the Fullscreen API.
  return (doc.fullscreenElement ?? null) !== null;
}

export interface AudienceWindowProps {
  audience: AudienceWindowState;
  slides: readonly ReactNode[];
  /** MUI theme of the slides. */
  theme: Theme;
  /** Ends the presenter view. */
  onClose: () => void;
  /** The pointer of the presenter on the slide, to show to the audience. */
  pointer?: PointerStore | undefined;
  /** How to show the pointer. */
  pointerMode?: PointerMode;
  /**
   * How the presenter interacts with the slide, like hover and focus, to show
   * to the audience.
   */
  interaction?: InteractionStore | undefined;
}

/**
 * Shows the current slide to the audience in a separate window, without any
 * controls, while the deck becomes the presenter view.
 *
 * The slide is rendered into the window by a portal, so it shares the state
 * of the deck, like the current step, with the presenter view.
 *
 * The pointer of the presenter is shown on the slide while it's over the
 * slide in the presenter view.
 *
 * Keys pressed in the window are handled as if they were pressed in the
 * presenter view, so that a presentation remote works with either window
 * focused, except that Escape ends the presenter view. So does leaving full
 * screen, if the window was opened in full screen.
 */
export function AudienceWindow({
  audience: { window: target, screen, container, cache },
  slides,
  theme,
  onClose,
  pointer,
  pointerMode = 'mirror',
  interaction,
}: AudienceWindowProps): JSX.Element {
  const [frame, setFrame] = useState<HTMLElement | null>(null);
  useEffect(
    () => (frame === null ? undefined : correctRipples(frame)),
    [frame],
  );
  // Fade the slide at the same time as the presenter view.
  const transitions = use(SlideTransitionsContext);
  const fades = getStepTransition(theme).duration > 0;
  useEffect(
    () => (frame === null || !fades ? undefined : transitions.register(frame)),
    [frame, fades, transitions],
  );
  const { slideIndex, lang } = useDeck();
  const { lang: uiLang, t } = useUiLanguage();
  // Like the page of the deck, the window is in the language of the slides.
  useEffect(() => {
    if (lang !== undefined) {
      target.document.documentElement.setAttribute('lang', lang);
    }
  }, [target, lang]);
  const [needsClick, setNeedsClick] = useState(false);
  const scale = useFitScale(target);

  const close = useEffectEvent(onClose);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        close();
        return;
      }
      const forwarded = new KeyboardEvent('keydown', {
        key: event.key,
        code: event.code,
        location: event.location,
        repeat: event.repeat,
        shiftKey: event.shiftKey,
        altKey: event.altKey,
        ctrlKey: event.ctrlKey,
        metaKey: event.metaKey,
        cancelable: true,
      });
      if (!window.dispatchEvent(forwarded)) {
        event.preventDefault();
      }
    };
    target.addEventListener('keydown', onKeyDown);
    return () => {
      target.removeEventListener('keydown', onKeyDown);
    };
  }, [target]);

  useEffect(() => {
    if (screen === undefined) {
      return undefined;
    }
    const { document: doc } = target;
    let wasFullscreen = isFullscreen(doc);
    if (!wasFullscreen) {
      // Browsers may only allow this in response to a click in the window.
      enterFullscreen(screen, doc).catch(() => {
        setNeedsClick(true);
      });
    }
    const onFullscreenChange = () => {
      const fullscreen = isFullscreen(doc);
      if (fullscreen) {
        setNeedsClick(false);
      } else if (wasFullscreen) {
        // Leaving full screen with Escape ends the presenter view, too.
        close();
      }
      wasFullscreen = fullscreen;
    };
    doc.addEventListener('fullscreenchange', onFullscreenChange);
    return () => {
      doc.removeEventListener('fullscreenchange', onFullscreenChange);
    };
  }, [target, screen]);

  return createPortal(
    <CacheProvider value={cache}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <SlideTransitionStyles />
        <Box
          sx={{
            position: 'fixed',
            inset: 0,
            overflow: 'hidden',
            bgcolor: 'common.black',
          }}
        >
          <SelectionFrame
            ref={setFrame}
            sx={SLIDE_FRAME_STYLES}
            style={{ transform: `scale(${String(scale)})` }}
            {...{ [SLIDE_VIEW_ATTRIBUTE]: 'audience' }}
          >
            <SlideMirror
              key={slideIndex}
              index={slideIndex}
              slide={slides[slideIndex]}
              kind="audience"
            />
            {pointer !== undefined && (
              <MirroredPointer store={pointer} mode={pointerMode} />
            )}
            {interaction !== undefined && (
              <InteractionMirror store={interaction} frame={frame} />
            )}
          </SelectionFrame>
        </Box>
        {needsClick && screen !== undefined && (
          <ThemeProvider theme={uiTheme}>
            <ButtonBase
              onClick={() => {
                enterFullscreen(screen, target.document).catch(
                  (error: unknown) => {
                    console.warn(
                      'Could not show the slides in full screen:',
                      error,
                    );
                  },
                );
              }}
              sx={{
                position: 'fixed',
                inset: 0,
                bgcolor: 'rgb(0 0 0 / 60%)',
                color: 'common.white',
              }}
            >
              <Typography variant="h5" lang={uiLang}>
                {t('clickToShowInFullScreen')}
              </Typography>
            </ButtonBase>
          </ThemeProvider>
        )}
      </ThemeProvider>
    </CacheProvider>,
    container,
  );
}
