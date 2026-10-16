import { generateUtilityClasses } from '@mui/material';
import { styled, useThemeProps } from '@mui/material/styles';
import type { JSX } from 'react';

import type { ComponentTheme } from '../theme/ComponentTheme.ts';
import { classNames } from '../utils/classNames.ts';
import { Step, WITH_PREVIOUS, type StepProps } from '../steps/Step.tsx';

/** Props of an {@link Image}. */
export interface ImageProps extends Omit<
  StepProps,
  'component' | 'defaultAttachment' | 'children' | 'title'
> {
  src?: string | undefined;
  /** Text shown instead of the image, e.g., read out by screen readers. */
  alt?: string | undefined;
  /** Tooltip of the image. */
  title?: string | undefined;
  /** Width of the image in logical slide pixels. */
  width?: number | string | undefined;
  /** Height of the image in logical slide pixels. */
  height?: number | string | undefined;
  /**
   * Whether the image is a block of its own, e.g., an image on a line of its
   * own in Markdown, rather than in the text.
   */
  block?: boolean | undefined;
}

export type ImageClassKey = 'root' | 'img';

export const imageClasses: Record<ImageClassKey, string> =
  generateUtilityClasses('SliderImage', ['root', 'img']);

declare module '@mui/material/styles' {
  interface ComponentNameToClassKey {
    SliderImage: ImageClassKey;
  }

  interface ComponentsPropsList {
    SliderImage: ImageProps;
  }

  interface Components<Theme = unknown> {
    SliderImage?: ComponentTheme<'SliderImage', Theme> | undefined;
  }
}

interface ImageOwnerState extends ImageProps {
  block: boolean;
}

const ImageRoot = styled(Step, {
  name: 'SliderImage',
  slot: 'Root',
  overridesResolver: (_props, styles) => styles['root'],
})<{ ownerState: ImageOwnerState }>({
  display: 'inline-block',
  maxWidth: '100%',
  verticalAlign: 'bottom',
  variants: [
    {
      props: { block: true },
      style: { display: 'block', width: 'fit-content', marginInline: 'auto' },
    },
  ],
});

const ImageImg = styled('img', {
  name: 'SliderImage',
  slot: 'Img',
  overridesResolver: (_props, styles) => styles['img'],
})<{ ownerState: ImageOwnerState }>({
  display: 'block',
  maxWidth: '100%',
  height: 'auto',
});

/**
 * An image, which is shown with the previous step, like a paragraph, unless
 * it's a step of its own with `step`, or with a step behavior, e.g., `only`,
 * or placed otherwise, e.g., with `group`. Its `id` names it on the slide,
 * e.g., to point callouts at it.
 *
 * MDX decks render Markdown images like this, with the attributes after
 * them, e.g., `![Architecture](./arch.svg){#arch step width=600}`.
 *
 * Can be themed as `SliderImage` in the `components` of the MUI theme.
 */
export function Image(inProps: ImageProps): JSX.Element {
  const props = useThemeProps({ props: inProps, name: 'SliderImage' });
  const {
    src,
    alt = '',
    title,
    width,
    height,
    block = false,
    className,
    ...stepProps
  } = props;
  const ownerState: ImageOwnerState = { ...props, block };
  return (
    <ImageRoot
      component={block ? 'div' : 'span'}
      defaultAttachment={WITH_PREVIOUS}
      className={classNames(imageClasses.root, className)}
      ownerState={ownerState}
      {...stepProps}
    >
      <ImageImg
        className={imageClasses.img}
        ownerState={ownerState}
        src={src}
        alt={alt}
        title={title}
        width={width}
        height={height}
      />
    </ImageRoot>
  );
}
