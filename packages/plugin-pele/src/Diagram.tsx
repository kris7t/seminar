import { alpha, generateUtilityClasses } from '@mui/material';
import { styled, useThemeProps } from '@mui/material/styles';
import {
  Step,
  useCached,
  useMeasure,
  useSlideElementId,
  useSlideView,
  WITH_PREVIOUS,
  type ComponentTheme,
  type StepProps,
} from '@seminar/core';
import { register } from 'pele/core';
import { useId, useMemo, useState, type JSX } from 'react';

import { diagramCache, joinIds, type RenderedDiagram } from './diagramCache.ts';

/** A type of diagrams of Pele, e.g., the default export of `pele/diagrams/flowchart`. */
export type PeleDiagram = Parameters<typeof register>[number];

/** Props of a {@link Diagram}. */
export interface DiagramProps extends Omit<
  StepProps,
  'component' | 'defaultAttachment' | 'children'
> {
  /** The Mermaid source of the diagram. */
  source: string;
  /** The types of diagrams that `source` may use, which are registered with Pele. */
  diagrams?: readonly PeleDiagram[] | undefined;
}

export type DiagramClassKey = 'root' | 'svg' | 'error';

export const diagramClasses: Record<DiagramClassKey, string> =
  generateUtilityClasses('SeminarDiagram', ['root', 'svg', 'error']);

declare module '@mui/material/styles' {
  interface ComponentNameToClassKey {
    SeminarDiagram: DiagramClassKey;
  }

  interface ComponentsPropsList {
    SeminarDiagram: DiagramProps;
  }

  interface Components<Theme = unknown> {
    SeminarDiagram?: ComponentTheme<'SeminarDiagram', Theme> | undefined;
  }
}

const DiagramRoot = styled(Step, {
  name: 'SeminarDiagram',
  slot: 'Root',
  overridesResolver: (_props, styles) => styles['root'],
})(({ theme }) => {
  const { palette } = theme;
  const series = [
    palette.primary.main,
    palette.secondary.main,
    palette.success.main,
    palette.warning.main,
    palette.error.main,
    palette.info.main,
    palette.primary.dark,
    palette.secondary.dark,
  ];
  return {
    display: 'flex',
    justifyContent: 'center',
    margin: theme.spacing(2, 0),
    fontSize: '0.75em',
    // The colors of Pele, which apply without rendering diagrams again.
    '--pele-bg': palette.background.default,
    '--pele-fg': palette.text.primary,
    '--pele-muted': palette.text.secondary,
    '--pele-line': palette.text.secondary,
    '--pele-surface': alpha(palette.primary.main, 0.08),
    '--pele-surface-alt': alpha(palette.primary.main, 0.16),
    '--pele-border': palette.primary.main,
    '--pele-accent': palette.primary.main,
    '--pele-radius': `${String(theme.shape.borderRadius)}px`,
    ...Object.fromEntries(
      series.map((color, index) => [
        `--pele-series-${String(index + 1)}`,
        color,
      ]),
    ),
  };
});

const DiagramSvg = styled('div', {
  name: 'SeminarDiagram',
  slot: 'Svg',
  overridesResolver: (_props, styles) => styles['svg'],
})({
  display: 'flex',
  justifyContent: 'center',
  maxWidth: '100%',
});

const DiagramError = styled('pre', {
  name: 'SeminarDiagram',
  slot: 'Error',
  overridesResolver: (_props, styles) => styles['error'],
})(({ theme }) => ({
  margin: 0,
  color: theme.palette.error.main,
}));

interface Font {
  family: string;
  size: number;
}

interface RenderedSvgProps {
  source: string;
  font: Font;
  /** The prefix of the ids of the diagram in this rendering of the slide. */
  prefix: string;
}

function RenderedSvg({ source, font, prefix }: RenderedSvgProps): JSX.Element {
  const result = useCached(diagramCache, {
    source,
    fontFamily: font.family,
    fontSize: font.size,
  });
  // Keeps showing the diagram while it changes, e.g., while editing.
  const [previous, setPrevious] = useState<RenderedDiagram>();
  if (result.status === 'success' && result.value !== previous) {
    setPrevious(result.value);
  }
  const diagram = result.value ?? previous;
  const html = useMemo(
    () => (diagram === undefined ? '' : joinIds(diagram, prefix)),
    [diagram, prefix],
  );
  if (result.status === 'error') {
    return (
      <DiagramError
        className={diagramClasses.error}
        title={`Cannot render diagram: ${String(result.error)}`}
      >
        {source}
      </DiagramError>
    );
  }
  return (
    <DiagramSvg
      className={diagramClasses.svg}
      // Rendered by Pele, which escapes the text of the diagram.
      // eslint-disable-next-line @eslint-react/dom-no-dangerously-set-innerhtml
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

interface DiagramContentProps {
  source: string;
  name: string | undefined;
}

/** Renders the diagram once it knows the font of the slide around it. */
function DiagramContent({ source, name }: DiagramContentProps): JSX.Element {
  const [element, setElement] = useState<HTMLDivElement | null>(null);
  const [font, setFont] = useState<Font>();
  useMeasure(element, () => {
    const style = element?.ownerDocument.defaultView?.getComputedStyle(element);
    if (style === undefined) {
      return;
    }
    // Not every environment computes fonts, e.g., jsdom.
    const family = style.fontFamily || 'sans-serif';
    const size = Number.parseFloat(style.fontSize) || 16;
    if (font?.family !== family || font.size !== size) {
      setFont({ family, size });
    }
  });
  const id = useId();
  const elementId = useSlideElementId(name ?? '');
  const prefix =
    name === undefined
      ? `seminar-diagram-${id.replace(/[^\w-]/g, '')}`
      : elementId;
  return (
    <div ref={setElement}>
      {font !== undefined && (
        <RenderedSvg source={source} font={font} prefix={prefix} />
      )}
    </div>
  );
}

/**
 * A Mermaid diagram, rendered by Pele in the font of the slide. It's shown
 * with the previous step, like images, unless it's placed otherwise. Its `id`
 * names it on the slide, e.g., to point callouts at it. Documents show its
 * `source` in a plain `pre` instead, with `mermaid` in `data-lang`.
 *
 * MDX decks render ` ```mermaid ` code blocks like this, with the attributes
 * after the language, e.g., ` ```mermaid #pipeline step `.
 *
 * Its colors follow the palette of the theme. It can be themed as
 * `SeminarDiagram` in the `components` of the MUI theme, also with the CSS
 * custom properties of Pele, e.g., `--pele-accent`.
 */
export function Diagram(inProps: DiagramProps): JSX.Element {
  const {
    source,
    diagrams = [],
    className,
    ...stepProps
  } = useThemeProps({ props: inProps, name: 'SeminarDiagram' });
  const { kind } = useSlideView();
  if (kind === 'document') {
    // Pele only renders diagrams in the browser.
    return (
      <Step
        component="pre"
        defaultAttachment={WITH_PREVIOUS}
        className={className}
        data-lang="mermaid"
        {...stepProps}
      >
        {source}
      </Step>
    );
  }
  register(...diagrams);
  return (
    <DiagramRoot
      component="div"
      defaultAttachment={WITH_PREVIOUS}
      className={
        className === undefined
          ? diagramClasses.root
          : `${diagramClasses.root} ${className}`
      }
      {...stepProps}
    >
      {/* Probes have no layout to measure fonts in. */}
      {kind !== 'probe' && (
        <DiagramContent source={source} name={stepProps.id} />
      )}
    </DiagramRoot>
  );
}
