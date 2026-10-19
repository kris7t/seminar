import { evaluate } from '@mdx-js/mdx';
import {
  Fragment,
  isValidElement,
  type ReactElement,
  type ReactNode,
} from 'react';
import * as runtime from 'react/jsx-runtime';

import { SLIDE_EXPORT_PREFIX } from '../deck/recmaSlideExports.ts';
import { loadDeckSetup, readDeckTheme } from '../config/deckSetup.ts';
import type { ModuleImporter } from '../config/themeConfig.ts';
import { sliderMdxOptions, type SliderMdxOptions } from '../options.ts';

export type SlideSummary = Record<string, unknown>;

/** URL of the stub of `@slider/core` that compiled decks import. */
export const STUB_URL: string = new URL('stub.ts', import.meta.url).href;

/** URL of a theme for compiled decks. */
export const THEME_URL: string = new URL('theme.ts', import.meta.url).href;

export async function compileDeck(source: string) {
  const module = await evaluate(source, {
    ...runtime,
    ...sliderMdxOptions({
      importSource: STUB_URL,
    }),
    baseUrl: import.meta.url,
  });
  return module as typeof module & { frontmatter: Record<string, unknown> };
}

/**
 * Whether `node` is an element of the stub component `name`. The document
 * imports the stub separately from the tests, so compare components by name.
 */
export function isComponent<P>(
  node: ReactNode,
  name: string,
): node is ReactElement<P> {
  return (
    isValidElement(node) &&
    typeof node.type === 'function' &&
    node.type.name === name
  );
}

export function renderDeck(
  module: Awaited<ReturnType<typeof compileDeck>>,
  props: Record<string, unknown> = {},
): ReactElement<{ children: ReactNode[] }> {
  // The MDX types use the global JSX namespace, which React 19 doesn't define.
  const element = (module.default as (props: object) => ReactNode)(props);
  if (!isComponent<{ children: ReactNode[] }>(element, 'Deck')) {
    throw new Error('Expected a Deck');
  }
  return element;
}

export function text(node: ReactNode): string {
  if (Array.isArray(node)) {
    return node.map(text).join('');
  }
  if (isValidElement<{ children?: ReactNode }>(node)) {
    if (typeof node.type === 'string') {
      return `<${node.type}>${text(node.props.children)}</${node.type}>`;
    }
    if (node.type === Fragment) {
      return text(node.props.children);
    }
    // Titles and notes of slides included from other decks are rendered by
    // them.
    if (
      typeof node.type === 'function' &&
      (node.type.name.startsWith('__sliderTitle') ||
        node.type.name.startsWith('__sliderNotes'))
    ) {
      return text((node.type as (props: object) => ReactNode)(node.props));
    }
    // Show components with their props, e.g., `<Step with="previous">`.
    const { children, ...props } = node.props;
    const name = typeof node.type === 'function' ? node.type.name : 'component';
    const attributes = Object.entries(props).map(
      ([key, value]) => ` ${key}=${JSON.stringify(value)}`,
    );
    return `<${name}${attributes.join('')}>${text(children)}</${name}>`;
  }
  return typeof node === 'string' ? node : '';
}

/**
 * Renders the component that the deck exports for a slide (see
 * `recmaSlideExports`), which renders the slide.
 */
export function renderSlideExport(node: ReactNode): ReactNode {
  let current = node;
  // Included slides are rendered by the components of their decks, too.
  while (
    isValidElement<Record<string, unknown>>(current) &&
    typeof current.type === 'function' &&
    current.type.name.startsWith(SLIDE_EXPORT_PREFIX)
  ) {
    current = (current.type as (props: object) => ReactNode)(current.props);
  }
  return current;
}

/** Summarizes the slides of the deck, with titles and children as text. */
export async function slides(source: string): Promise<SlideSummary[]> {
  const deck = renderDeck(await compileDeck(source));
  return [deck.props.children].flat().map((child) => {
    const slide = renderSlideExport(child);
    if (!isComponent<Record<string, unknown>>(slide, 'Slide')) {
      throw new Error('Expected a Slide');
    }
    const { children, title, master, notes, ...props } = slide.props;
    return {
      // Show component masters by the name of the component.
      master: typeof master === 'function' ? `<${master.name}>` : master,
      ...props,
      ...(title === undefined ? {} : { title: text(title as ReactNode) }),
      ...(notes === undefined ? {} : { notes: text(notes as ReactNode) }),
      children: text(children as ReactNode),
    };
  });
}

/**
 * Adds the config of the theme of the deck with `source`, if any, to
 * `options`, like integrations do before compiling decks.
 */
export async function withThemeConfig(
  source: string,
  deckPath: string,
  options: SliderMdxOptions = {},
  importModule?: ModuleImporter,
): Promise<SliderMdxOptions> {
  const theme = readDeckTheme(source) ?? options.defaultTheme;
  if (theme === undefined) {
    return options;
  }
  const setup = await loadDeckSetup({
    theme,
    pluginsImporter: deckPath,
    themeImporter: deckPath,
    importModule,
  });
  return {
    ...options,
    sliderConfigs: [...(options.sliderConfigs ?? []), ...setup.sliderConfigs],
    mdxPlugins: setup.mdxPlugins,
  };
}
