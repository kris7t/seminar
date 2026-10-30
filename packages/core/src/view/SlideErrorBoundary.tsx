import { Box } from '@mui/material';
import { Component, type JSX, type ReactNode } from 'react';

import { useT } from '../i18n/UiLanguageContext.ts';

/** Shows what went wrong in place of a slide. */
function SlideError({ error }: { error: unknown }): JSX.Element {
  const t = useT();
  const message = error instanceof Error ? error.message : String(error);
  const stack = error instanceof Error ? error.stack : undefined;
  return (
    <Box
      role="alert"
      sx={{
        position: 'absolute',
        inset: 0,
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column',
        gap: 2,
        p: 6,
        overflow: 'auto',
        bgcolor: 'background.default',
        color: 'text.primary',
        fontFamily: 'sans-serif',
        fontSize: 24,
      }}
    >
      <Box sx={{ color: 'error.main', fontSize: 32, fontWeight: 'bold' }}>
        {t('slideError')}
      </Box>
      <Box sx={{ overflowWrap: 'anywhere' }}>{message}</Box>
      {stack !== undefined && (
        <Box
          component="pre"
          sx={{ m: 0, fontSize: 16, whiteSpace: 'pre-wrap', opacity: 0.7 }}
        >
          {stack}
        </Box>
      )}
    </Box>
  );
}

interface SlideErrorBoundaryProps {
  children?: ReactNode;
}

/**
 * Shows the error of a slide that fails to render instead of it, so that the
 * rest of the deck keeps working. It renders the slide again when it is
 * remounted, e.g., when the slide is shown again, or by React Fast Refresh.
 */
export class SlideErrorBoundary extends Component<
  SlideErrorBoundaryProps,
  { failed: boolean; error: unknown }
> {
  override state = { failed: false, error: undefined };

  static getDerivedStateFromError(error: unknown): {
    failed: boolean;
    error: unknown;
  } {
    return { failed: true, error };
  }

  override render(): ReactNode {
    return this.state.failed ? (
      <SlideError error={this.state.error} />
    ) : (
      this.props.children
    );
  }
}
