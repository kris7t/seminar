import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { Box, ButtonBase, Typography } from '@mui/material';
import { useId, type JSX, type ReactNode } from 'react';

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
      <Typography variant="subtitle2" component="h2">
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
            px: 1,
            py: 1,
            font: 'inherit',
          }}
        >
          <ExpandMoreIcon
            fontSize="small"
            sx={[
              { transition: 'transform 150ms' },
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
          sx={{ flex: 1, minHeight: 0, overflowY: 'auto' }}
        >
          {children}
        </Box>
      )}
    </Box>
  );
}

export interface SidebarProps {
  sections: readonly SidebarSection[];
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
export function Sidebar({ sections }: SidebarProps): JSX.Element {
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
      {sections.map(({ key, ...section }) => (
        <Section key={key} {...section} />
      ))}
    </Box>
  );
}
