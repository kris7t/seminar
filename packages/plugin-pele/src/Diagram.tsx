import { alpha, generateUtilityClasses } from '@mui/material';
import { styled, useThemeProps } from '@mui/material/styles';
import { useForkRef } from '@mui/material/utils';
import {
  appearanceClass,
  Step,
  useCached,
  useMeasure,
  useSlideElementId,
  useSlideElementRegistry,
  useSlideView,
  useStepAppearance,
  WITH_PREVIOUS,
  type ComponentTheme,
  type RankedAppearance,
  type StepProps,
} from '@seminar/core';
import { register } from 'pele/core';
import {
  useCallback,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type JSX,
} from 'react';

import { diagramCache, joinIds, type RenderedDiagram } from './diagramCache.ts';
import { findItems } from './items.ts';

/** A type of diagrams of Pele, e.g., the default export of `pele/diagrams/flowchart`. */
export type PeleDiagram = Parameters<typeof register>[number];

/**
 * A step of the items of a diagram, e.g., of nodes and edges, which shows the
 * elements with their ids as their `data-id`.
 */
export interface DiagramStep {
  /** The ids of the items that the step shows. */
  items: readonly string[];
  /** The props of the step, like those of `Step`, e.g., `group` or `only`. */
  props?: Readonly<Record<string, string>> | undefined;
  /** The steps nested in this step, e.g., of the items in a cluster. */
  steps?: readonly DiagramStep[] | undefined;
}

/**
 * A formula in the labels of a diagram, typeset as SVG that fills the box
 * that Pele puts it in, with its size in ems of the text around it.
 */
export interface DiagramFormula {
  svg: string;
  width: number;
  height: number;
}

/** Props of a {@link Diagram}. */
export interface DiagramProps extends Omit<
  StepProps,
  'component' | 'defaultAttachment' | 'children'
> {
  /** The Mermaid source of the diagram. */
  source: string;
  /** The types of diagrams that `source` may use, which are registered with Pele. */
  diagrams?: readonly PeleDiagram[] | undefined;
  /** The steps of the items of the diagram, in order. */
  steps?: readonly DiagramStep[] | undefined;
  /** The formulas in the labels of the diagram, like `$$x^2$$`, by their TeX. */
  formulas?: Readonly<Record<string, DiagramFormula>> | undefined;
}

export type DiagramClassKey =
  'root' | 'svg' | 'error' | 'hidden' | 'dimmed' | 'collapsed';

export const diagramClasses: Record<DiagramClassKey, string> =
  generateUtilityClasses('SeminarDiagram', [
    'root',
    'svg',
    'error',
    'hidden',
    'dimmed',
    'collapsed',
  ]);

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
    // The appearances of the steps of items, like those of `Step`. The
    // layout of the diagram doesn't change, even for collapsed items.
    [`& .${diagramClasses.hidden}`]: { visibility: 'hidden', opacity: 0 },
    [`& .${diagramClasses.dimmed}`]: {
      opacity: 'var(--SeminarStep-dim-opacity, 0.35)',
    },
    [`& .${diagramClasses.collapsed}`]: { display: 'none' },
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

/** The rendered SVG of a diagram in a rendering of the slide. */
interface DiagramTarget {
  /** The element with the SVG. */
  root: Element;
  /** The SVG, which is replaced when it changes. */
  html: string;
}

const NO_FORMULAS: Readonly<Record<string, DiagramFormula>> = {};

interface RenderedSvgProps {
  source: string;
  formulas: Readonly<Record<string, DiagramFormula>>;
  font: Font;
  /** The prefix of the ids of the diagram in this rendering of the slide. */
  prefix: string;
  /** The name of the diagram on the slide, if any. */
  name: string | undefined;
  onTarget: (target: DiagramTarget | undefined) => void;
}

function RenderedSvg({
  source,
  formulas,
  font,
  prefix,
  name,
  onTarget,
}: RenderedSvgProps): JSX.Element {
  const result = useCached(diagramCache, {
    source,
    formulas,
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
  const ref = useRef<HTMLDivElement>(null);
  // Tells the steps of the items about every new SVG.
  const targetRef = useCallback(
    (root: HTMLDivElement | null) => {
      onTarget(root === null ? undefined : { root, html });
    },
    [onTarget, html],
  );
  const forkedRef = useForkRef(ref, targetRef);
  const register = useSlideElementRegistry();
  useLayoutEffect(() => {
    const root = ref.current;
    if (name === undefined || root === null || html === '') {
      return undefined;
    }
    // The items of a named diagram are named after it, e.g., `pipeline.A`.
    const unregister = [...findItems(root)].map(([id, element]) =>
      register(`${name}.${id}`, element),
    );
    return () => {
      for (const done of unregister) done();
    };
  }, [register, name, html]);
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
      ref={forkedRef}
      className={diagramClasses.svg}
      // Rendered by Pele, which escapes the text of the diagram.
      // eslint-disable-next-line @eslint-react/dom-no-dangerously-set-innerhtml
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

interface DiagramContentProps {
  source: string;
  formulas: Readonly<Record<string, DiagramFormula>>;
  name: string | undefined;
  onTarget: (target: DiagramTarget | undefined) => void;
}

/** Renders the diagram once it knows the font of the slide around it. */
function DiagramContent({
  source,
  formulas,
  name,
  onTarget,
}: DiagramContentProps): JSX.Element {
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
        <RenderedSvg
          source={source}
          formulas={formulas}
          font={font}
          prefix={prefix}
          name={name}
          onTarget={onTarget}
        />
      )}
    </div>
  );
}

interface ItemAppearanceProps {
  items: readonly string[];
  target: DiagramTarget | undefined;
  /** How the diagram looks, which its items inherit. */
  enclosing: RankedAppearance;
}

/** Shows the items of a step of a diagram like the step around it. */
function ItemAppearance({
  items,
  target,
  enclosing,
}: ItemAppearanceProps): null {
  const className = appearanceClass(
    'SeminarDiagram',
    useStepAppearance(),
    enclosing,
  );
  useLayoutEffect(() => {
    if (target === undefined || className === undefined) {
      return undefined;
    }
    const elements = items.flatMap((item) => [
      ...target.root.querySelectorAll(`[data-id=${JSON.stringify(item)}]`),
    ]);
    for (const element of elements) {
      element.classList.add(className);
    }
    return () => {
      for (const element of elements) {
        element.classList.remove(className);
      }
    };
  }, [items, target, className]);
  return null;
}

interface ItemStepProps {
  step: DiagramStep;
  target: DiagramTarget | undefined;
  enclosing: RankedAppearance;
}

/**
 * A step of the items of a diagram, whose element marks its place among the
 * steps: after the steps before it, and inside the step that it's nested in.
 */
function ItemStep({ step, target, enclosing }: ItemStepProps): JSX.Element {
  return (
    <Step component="span" hidden {...step.props}>
      <ItemAppearance
        items={step.items}
        target={target}
        enclosing={enclosing}
      />
      {step.steps?.map((nested, index) => (
        <ItemStep
          // Steps don't change while the slide is shown.
          // eslint-disable-next-line @eslint-react/no-array-index-key
          key={index}
          step={nested}
          target={target}
          enclosing={enclosing}
        />
      ))}
    </Step>
  );
}

interface ItemStepsProps {
  steps: readonly DiagramStep[];
  target: DiagramTarget | undefined;
}

function ItemSteps({ steps, target }: ItemStepsProps): JSX.Element {
  // How the diagram looks, which is the step around the steps of its items.
  const enclosing = useStepAppearance();
  return (
    <>
      {steps.map((step, index) => (
        <ItemStep
          // eslint-disable-next-line @eslint-react/no-array-index-key
          key={index}
          step={step}
          target={target}
          enclosing={enclosing}
        />
      ))}
    </>
  );
}

/**
 * A Mermaid diagram, rendered by Pele in the font of the slide. It's shown
 * with the previous step, like images, unless it's placed otherwise. Its `id`
 * names it on the slide, e.g., to point callouts at it, and its items, like
 * nodes and edges with ids, after it, e.g., `pipeline.A` for the node `A` of
 * the diagram `pipeline`. Documents show its
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
    steps = [],
    formulas = NO_FORMULAS,
    className,
    ...stepProps
  } = useThemeProps({ props: inProps, name: 'SeminarDiagram' });
  const { kind } = useSlideView();
  const [target, setTarget] = useState<DiagramTarget>();
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
        <DiagramContent
          source={source}
          formulas={formulas}
          name={stepProps.id}
          onTarget={setTarget}
        />
      )}
      {/* Probes find the steps, too. */}
      <ItemSteps steps={steps} target={target} />
    </DiagramRoot>
  );
}
