import { generateUtilityClasses } from '@mui/material';
import { styled, useThemeProps } from '@mui/material/styles';
import type { JSX, ReactNode } from 'react';

import type { ComponentTheme } from '../theme/ComponentTheme.ts';
import { classNames } from '../theme/classNames.ts';
import { Step, WITH_CONTENT, type StepProps } from '../steps/Step.tsx';

/** Props of an {@link Image}. */
export interface ImageProps extends Omit<
  StepProps,
  'component' | 'defaultAttachment' | 'children' | 'title'
> {
  src?: string | undefined;
  /**
   * What the image shows, read out by screen readers instead of it. Without
   * it, the image is decorative, unless it has a caption, which stands in
   * for it. With a caption, it shouldn't repeat the caption, since screen
   * readers read both.
   */
  alt?: string | undefined;
  /** Tooltip of the image. */
  title?: string | undefined;
  /**
   * Caption shown below a block image, in a `figcaption`, e.g., the title of
   * an image on a line of its own in Markdown. Ignored in the text.
   */
  caption?: ReactNode;
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

export type ImageClassKey = 'root' | 'img' | 'caption';

export const imageClasses: Record<ImageClassKey, string> =
  generateUtilityClasses('SeminarImage', ['root', 'img', 'caption']);

declare module '@mui/material/styles' {
  interface ComponentNameToClassKey {
    SeminarImage: ImageClassKey;
  }

  interface ComponentsPropsList {
    SeminarImage: ImageProps;
  }

  interface Components<Theme = unknown> {
    SeminarImage?: ComponentTheme<'SeminarImage', Theme> | undefined;
  }
}

interface ImageOwnerState extends ImageProps {
  block: boolean;
}

const ImageRoot = styled(Step, {
  name: 'SeminarImage',
  slot: 'Root',
  overridesResolver: (_props, styles) => styles['root'],
})<{ ownerState: ImageOwnerState }>({
  display: 'inline-block',
  maxWidth: '100%',
  verticalAlign: 'bottom',
  variants: [
    {
      props: { block: true },
      style: {
        display: 'block',
        width: 'fit-content',
        // Figures have margins of their own.
        marginBlock: 0,
        marginInline: 'auto',
      },
    },
  ],
});

const ImageImg = styled('img', {
  name: 'SeminarImage',
  slot: 'Img',
  overridesResolver: (_props, styles) => styles['img'],
})<{ ownerState: ImageOwnerState }>({
  display: 'block',
  maxWidth: '100%',
  height: 'auto',
});

const ImageCaption = styled('figcaption', {
  name: 'SeminarImage',
  slot: 'Caption',
  overridesResolver: (_props, styles) => styles['caption'],
})<{ ownerState: ImageOwnerState }>(({ theme }) => ({
  ...theme.typography.caption,
  display: 'block',
  marginTop: theme.spacing(1),
  color: theme.palette.text.secondary,
  textAlign: 'center',
}));

/**
 * An image, which is shown with the previous step, like a paragraph, unless
 * it's a step of its own with `step`, or with a step behavior, e.g., `only`,
 * or placed otherwise, e.g., with `group`. Its `id` names it on the slide,
 * e.g., to point callouts at it.
 *
 * MDX decks render Markdown images like this, with the attributes after
 * them, e.g., `![Architecture](./arch.svg){#arch step width=600}`.
 *
 * Can be themed as `SeminarImage` in the `components` of the MUI theme.
 */
export function Image(inProps: ImageProps): JSX.Element {
  const props = useThemeProps({ props: inProps, name: 'SeminarImage' });
  const {
    src,
    alt,
    title,
    caption,
    width,
    height,
    block = false,
    className,
    ...stepProps
  } = props;
  const ownerState: ImageOwnerState = { ...props, block };
  const figure = block && caption !== undefined && caption !== null;
  return (
    <ImageRoot
      component={figure ? 'figure' : block ? 'div' : 'span'}
      defaultAttachment={WITH_CONTENT}
      className={classNames(imageClasses.root, className)}
      ownerState={ownerState}
      {...stepProps}
    >
      <ImageImg
        className={imageClasses.img}
        ownerState={ownerState}
        src={src}
        // A caption may stand in for the alt text, but decorative images
        // without either need an empty one.
        alt={alt ?? (figure ? undefined : '')}
        title={title}
        width={width}
        height={height}
      />
      {figure && (
        <ImageCaption className={imageClasses.caption} ownerState={ownerState}>
          {caption}
        </ImageCaption>
      )}
    </ImageRoot>
  );
}
