import { createContext, use, type Context, type JSX } from 'react';

import type {
  SlideMaster,
  SlideMasterProps,
  SlideMasters,
} from './SlideMaster.ts';

/** What the masters of a slide in a `document` view link to. */
export interface DocumentSlide {
  /** Id of the heading, which the location hash of the slide refers to. */
  anchor: string;
  /** The location hash of the slide, e.g., `#results`. */
  href: string;
  /** Title of the heading of a slide without a title, e.g., `Slide 3`. */
  untitled: string;
  /** Label of the permalink of the slide in the heading. */
  linkLabel: string;
  /** The language of `untitled` and `linkLabel`, if it differs. */
  labelLang: string | undefined;
}

export const DocumentSlideContext: Context<DocumentSlide | undefined> =
  createContext<DocumentSlide | undefined>(undefined);

type HeadingTag = 'h1' | 'h2' | 'h3' | 'h4';

interface DocumentMasterProps extends SlideMasterProps {
  heading: HeadingTag;
}

/**
 * Lays out a slide as a heading followed by its content, without elements of
 * its own around them, so that the slides of a document follow each other.
 */
function DocumentMaster({
  heading: Heading,
  title,
  children,
}: DocumentMasterProps): JSX.Element {
  const slide = use(DocumentSlideContext);
  const untitled = title === undefined || title === null || title === '';
  return (
    <>
      <Heading
        id={slide?.anchor}
        lang={untitled ? slide?.labelLang : undefined}
      >
        {untitled ? slide?.untitled : title}
        {slide !== undefined && (
          <>
            {' '}
            <a
              href={slide.href}
              aria-label={slide.linkLabel}
              lang={slide.labelLang}
            >
              #
            </a>
          </>
        )}
      </Heading>
      {children}
    </>
  );
}

function TitleDocumentMaster(props: SlideMasterProps): JSX.Element {
  return <DocumentMaster heading="h1" {...props} />;
}

function SectionDocumentMaster(props: SlideMasterProps): JSX.Element {
  return <DocumentMaster heading="h2" {...props} />;
}

function SubsectionDocumentMaster(props: SlideMasterProps): JSX.Element {
  return <DocumentMaster heading="h3" {...props} />;
}

function ContentDocumentMaster(props: SlideMasterProps): JSX.Element {
  return <DocumentMaster heading="h4" {...props} />;
}

const DOCUMENT_MASTERS: Readonly<
  Record<'title' | 'section' | 'subsection', SlideMaster>
> = {
  title: TitleDocumentMaster,
  section: SectionDocumentMaster,
  subsection: SubsectionDocumentMaster,
};

/**
 * Returns the master that lays out a slide with `master` in a `document`
 * view: a heading by the level of the master, `h1` for the title, `h2` for
 * sections, `h3` for subsections, and `h4` for every other slide.
 */
export function getDocumentMaster(
  master: string | SlideMaster,
  masters: SlideMasters,
): SlideMaster {
  const name =
    typeof master === 'string'
      ? master
      : Object.keys(DOCUMENT_MASTERS).find((key) => masters[key] === master);
  return name !== undefined && Object.hasOwn(DOCUMENT_MASTERS, name)
    ? DOCUMENT_MASTERS[name as keyof typeof DOCUMENT_MASTERS]
    : ContentDocumentMaster;
}
