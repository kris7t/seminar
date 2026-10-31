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
  WITH_CONTENT,
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
  type CSSProperties,
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
  /**
   * The width of the diagram, in logical slide pixels or any CSS length, e.g.,
   * `50%`. Defaults to the width available, e.g., of the column. Wider
   * diagrams are laid out to fit it, and narrower ones keep their size. If it's
   * more than available, the diagram is shown smaller to fit, like images.
   */
  width?: number | string | undefined;
  /**
   * How large the diagram is, compared to its size with the text of diagrams
   * of the slide, e.g., `1.5`. Defaults to 1.
   */
  scale?: number | string | undefined;
  /**
   * The size of the text of the diagram, before scaling, in logical slide
   * pixels or any CSS length, e.g., `0.6em` of the text around it. Defaults
   * to `0.75em`. Unlike scaling, it keeps the space between nodes.
   */
  fontSize?: number | string | undefined;
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
  // Scaled, but not wider than the diagram, like Pele does.
  '& > svg': {
    width: 'var(--SeminarDiagram-width)',
    maxWidth: '100%',
    height: 'auto',
  },
});

const DiagramError = styled('pre', {
  name: 'SeminarDiagram',
  slot: 'Error',
  overridesResolver: (_props, styles) => styles['error'],
})(({ theme }) => ({
  margin: 0,
  color: theme.palette.error.main,
}));

/** Where a diagram is rendered, as measured on the slide. */
interface Layout {
  /** The family of the font of the slide, as in CSS. */
  family: string;
  /** The size of the font of the diagram, in pixels. */
  size: number;
  /** The width of the diagram, in pixels, even if more than available. */
  width: number;
}

/** Returns `value` in CSS, with numbers in pixels, like the width of columns. */
function cssLength(value: number | string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const text = String(value).trim();
  return text !== '' && Number.isFinite(Number(text)) ? `${text}px` : text;
}

/** The rendered SVG of a diagram in a rendering of the slide. */
interface DiagramTarget {
  /** The element with the SVG. */
  root: Element;
  /** The SVG, which is replaced when it changes. */
  html: string;
}

const NO_FORMULAS: Readonly<Record<string, DiagramFormula>> = {};

/**
 * Returns the group of `step` in the diagram called `name`: its own, or the
 * one named after its first item, e.g., `pipeline.compile`.
 */
function groupOf(
  step: DiagramStep,
  name: string | undefined,
): string | undefined {
  const [first] = step.items;
  return (
    step.props?.['group'] ??
    (name === undefined || first === undefined ? undefined : `${name}.${first}`)
  );
}

/** Returns the groups of the steps that show each item of `steps`. */
function groupsOfItems(
  steps: readonly DiagramStep[],
  name: string | undefined,
  groups = new Map<string, string>(),
): Map<string, string> {
  for (const step of steps) {
    const group = groupOf(step, name);
    if (group !== undefined) {
      for (const item of step.items) {
        groups.set(item, group);
      }
    }
    groupsOfItems(step.steps ?? [], name, groups);
  }
  return groups;
}

/** Returns the factor of `scale`, or 1 if it isn't a positive number. */
function scaleOf(scale: number | string): number {
  const factor = Number(scale);
  return Number.isFinite(factor) && factor > 0 ? factor : 1;
}

interface RenderedSvgProps {
  source: string;
  formulas: Readonly<Record<string, DiagramFormula>>;
  layout: Layout;
  scale: number;
  /** The prefix of the ids of the diagram in this rendering of the slide. */
  prefix: string;
  /** The name of the diagram on the slide, if any. */
  name: string | undefined;
  /** The groups of the steps that show the items, by their ids. */
  groups: ReadonlyMap<string, string>;
  onTarget: (target: DiagramTarget | undefined) => void;
}

function RenderedSvg({
  source,
  formulas,
  layout,
  scale,
  prefix,
  name,
  groups,
  onTarget,
}: RenderedSvgProps): JSX.Element {
  const result = useCached(diagramCache, {
    source,
    formulas,
    fontFamily: layout.family,
    fontSize: layout.size,
    // Laid out to fit the width at the size before scaling.
    maxWidth: layout.width > 0 ? Math.floor(layout.width / scale) : undefined,
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
    // The items of a named diagram are named after it, e.g., `pipeline.A`,
    // and are in the steps that show them, e.g., for callouts pointing at them.
    const unregister = [...findItems(root)].map(([id, element]) =>
      register(`${name}.${id}`, element, { group: groups.get(id) }),
    );
    return () => {
      for (const done of unregister) done();
    };
  }, [register, name, groups, html]);
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
      style={
        diagram === undefined
          ? undefined
          : ({
              '--SeminarDiagram-width': `${String(diagram.width * scale)}px`,
            } as CSSProperties)
      }
      // Rendered by Pele, which escapes the text of the diagram.
      // eslint-disable-next-line @eslint-react/dom-no-dangerously-set-innerhtml
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

interface DiagramContentProps {
  source: string;
  formulas: Readonly<Record<string, DiagramFormula>>;
  width: string | undefined;
  scale: number;
  name: string | undefined;
  groups: ReadonlyMap<string, string>;
  onTarget: (target: DiagramTarget | undefined) => void;
}

/**
 * Renders the diagram once it knows the font of the slide around it, and the
 * width available for it.
 */
function DiagramContent({
  source,
  formulas,
  width,
  scale,
  name,
  groups,
  onTarget,
}: DiagramContentProps): JSX.Element {
  const [element, setElement] = useState<HTMLDivElement | null>(null);
  const probeRef = useRef<HTMLDivElement>(null);
  const [layout, setLayout] = useState<Layout>();
  useMeasure(element, () => {
    const style = element?.ownerDocument.defaultView?.getComputedStyle(element);
    if (probeRef.current === null || style === undefined) {
      return;
    }
    // Not every environment computes fonts, e.g., jsdom.
    const family = style.fontFamily || 'sans-serif';
    const size = Number.parseFloat(style.fontSize) || 16;
    // In logical slide pixels, like the font, however the slide is scaled.
    const measured = probeRef.current.offsetWidth;
    if (
      layout?.family !== family ||
      layout.size !== size ||
      layout.width !== measured
    ) {
      setLayout({ family, size, width: measured });
    }
  });
  const id = useId();
  const elementId = useSlideElementId(name ?? '');
  const prefix =
    name === undefined
      ? `seminar-diagram-${id.replace(/[^\w-]/g, '')}`
      : elementId;
  return (
    <div
      ref={setElement}
      style={{ position: 'relative', width: width ?? '100%', maxWidth: '100%' }}
    >
      {/*
       * Diagrams wider than available are laid out in their width, and shown
       * smaller, like images.
       */}
      <div
        ref={probeRef}
        style={{
          position: 'absolute',
          width: width ?? '100%',
          height: 0,
          visibility: 'hidden',
        }}
      />
      {layout !== undefined && (
        <RenderedSvg
          source={source}
          formulas={formulas}
          layout={layout}
          scale={scale}
          prefix={prefix}
          name={name}
          groups={groups}
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
  /** The name of the diagram on the slide, if any. */
  name: string | undefined;
}

/**
 * A step of the items of a diagram, whose element marks its place among the
 * steps: after the steps before it, and inside the step that it's nested in.
 * In a named diagram, it's in the group named after its first item, e.g.,
 * `pipeline.compile`, unless it has a group.
 */
function ItemStep({
  step,
  target,
  enclosing,
  name,
}: ItemStepProps): JSX.Element {
  const group = groupOf(step, name);
  return (
    <Step
      component="span"
      hidden
      {...step.props}
      {...(group === undefined ? {} : { group })}
    >
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
          name={name}
        />
      ))}
    </Step>
  );
}

interface ItemStepsProps {
  steps: readonly DiagramStep[];
  target: DiagramTarget | undefined;
  name: string | undefined;
}

function ItemSteps({ steps, target, name }: ItemStepsProps): JSX.Element {
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
          name={name}
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
 * the diagram `pipeline`. Documents show its `source` in a plain `pre`
 * instead, with `mermaid` in `data-lang`.
 *
 * It takes the width available, or its `width`, and diagrams wider than that
 * are laid out to fit it. Its `scale` makes it larger or smaller, e.g., `1.5`
 * for larger text, and wide diagrams are laid out to fit at the size before
 * scaling.
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
    width,
    scale = 1,
    fontSize,
    className,
    style,
    ...stepProps
  } = useThemeProps({ props: inProps, name: 'SeminarDiagram' });
  const { kind } = useSlideView();
  const [target, setTarget] = useState<DiagramTarget>();
  const groups = useMemo(
    () => groupsOfItems(steps, stepProps.id),
    [steps, stepProps.id],
  );
  if (kind === 'document') {
    // Pele only renders diagrams in the browser.
    return (
      <Step
        component="pre"
        defaultAttachment={WITH_CONTENT}
        className={className}
        style={style}
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
      defaultAttachment={WITH_CONTENT}
      className={
        className === undefined
          ? diagramClasses.root
          : `${diagramClasses.root} ${className}`
      }
      style={
        fontSize === undefined
          ? style
          : { ...style, fontSize: cssLength(fontSize) }
      }
      {...stepProps}
    >
      {/* Probes have no layout to measure fonts in. */}
      {kind !== 'probe' && (
        <DiagramContent
          source={source}
          formulas={formulas}
          width={cssLength(width)}
          scale={scaleOf(scale)}
          name={stepProps.id}
          groups={groups}
          onTarget={setTarget}
        />
      )}
      {/* Probes find the steps, too. */}
      <ItemSteps steps={steps} target={target} name={stepProps.id} />
    </DiagramRoot>
  );
}
