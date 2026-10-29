import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { Box, ButtonBase, Typography } from '@mui/material';
import { useId, type JSX, type ReactNode } from 'react';

import { DRAG_REGION } from '../menu/TitleBar.tsx';

/** Width of the sidebar in CSS pixels. */
export const SIDEBAR_WIDTH = 280;

/**
 * Scrolls the element it's attached to into view, e.g., the entry of the
 * current slide in a list, which moves the list along as the current slide
 * changes. Sections of the {@link Sidebar} also scroll the element with
 * `aria-current` into view when they are resized.
 */
export function scrollIntoView(element: Element | null): void {
  element?.scrollIntoView({ block: 'nearest' });
}

/** Keeps the current entry of a section in view as the section is resized. */
function followCurrent(element: HTMLElement | null): (() => void) | undefined {
  if (element === null) {
    return undefined;
  }
  const observer = new ResizeObserver(() => {
    scrollIntoView(element.querySelector('[aria-current]'));
  });
  observer.observe(element);
  return () => {
    observer.disconnect();
  };
}

export interface SidebarSection {
  /** Identifies the section among the sections of the sidebar. */
  key: string;
  title: string;
  expanded: boolean;
  onToggle: () => void;
  /** The contents of the section, shown if it's expanded. */
  children: ReactNode;
}

function Section({
  title,
  expanded,
  onToggle,
  children,
}: Omit<SidebarSection, 'key'>): JSX.Element {
  const id = useId();
  return (
    <Box
      sx={[
        {
          display: 'flex',
          flexDirection: 'column',
          minHeight: 0,
          '& + &': { borderTop: 1, borderColor: 'divider' },
        },
        // Expanded sections share the height, while collapsed ones only take
        // the height of their headers.
        expanded ? { flex: '1 1 0' } : { flex: 'none' },
      ]}
    >
      {/* Like the headings of the presenter view. */}
      <Typography
        variant="overline"
        component="h2"
        sx={{ color: 'text.secondary', lineHeight: 2 }}
      >
        <ButtonBase
          aria-expanded={expanded}
          aria-controls={id}
          onClick={onToggle}
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-start',
            gap: 0.5,
            width: '100%',
            // Room around the line of the heading, like the padding of the
            // panel of the presenter view, but less below it while the
            // section is expanded, since its entries have room of their own,
            // and the chevron in line with the entries.
            pt: 1,
            pb: expanded ? 0.5 : 1,
            px: 2,
            font: 'inherit',
            letterSpacing: 'inherit',
            textTransform: 'inherit',
          }}
        >
          <ExpandMoreIcon
            sx={[
              { fontSize: 18, transition: 'transform 150ms' },
              !expanded && { transform: 'rotate(-90deg)' },
            ]}
          />
          {title}
        </ButtonBase>
      </Typography>
      {expanded && (
        <Box
          id={id}
          ref={followCurrent}
          sx={{
            flex: 1,
            minHeight: 0,
            overflowY: 'auto',
            scrollbarWidth: 'thin',
          }}
        >
          {children}
        </Box>
      )}
    </Box>
  );
}

export interface SidebarProps {
  sections: readonly SidebarSection[];
  /**
   * Height of the title bar of the window, if the page draws it, which the
   * sidebar extends into.
   */
  titleBarHeight?: number | undefined;
}

/**
 * Sidebar with sections that can be expanded or collapsed, like an
 * accordion. Expanded sections share the height of the sidebar, each
 * scrolling on its own.
 *
 * The sidebar should only be shown if at least one of its sections is
 * expanded.
 *
 * Should be rendered with the {@link uiTheme}.
 */
export function Sidebar({
  sections,
  titleBarHeight,
}: SidebarProps): JSX.Element {
  return (
    <Box
      sx={{
        flex: 'none',
        display: 'flex',
        flexDirection: 'column',
        width: SIDEBAR_WIDTH,
        height: '100%',
        bgcolor: 'background.paper',
        color: 'text.primary',
        borderRight: 1,
        borderColor: 'divider',
      }}
    >
      {titleBarHeight !== undefined && (
        <Box sx={{ ...DRAG_REGION, flex: 'none', height: titleBarHeight }} />
      )}
      {sections.map(({ key, ...section }) => (
        <Section key={key} {...section} />
      ))}
    </Box>
  );
}
