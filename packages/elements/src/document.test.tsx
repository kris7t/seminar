import { Deck, DeckDocument, Paragraph, Slide } from '@seminar/core';
import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { Callout } from './callout/Callout.tsx';
import { CalloutTitle } from './callout/CalloutTitle.tsx';
import { Column } from './columns/Column.tsx';
import { Columns } from './columns/Columns.tsx';

/** Renders `children` on a slide of a document, without classes. */
function renderDocument(children: ReactNode): string {
  return renderToStaticMarkup(
    <DeckDocument>
      <Deck>
        <Slide title="Slide" id="slide">
          {children}
        </Slide>
      </Deck>
    </DeckDocument>,
  )
    .replaceAll(/ class="[^"]*"/g, '')
    .replace(/^<section><h4 .*?<\/h4>([^]*)<\/section>$/, '$1');
}

describe('elements in documents', () => {
  it('renders the headings of columns below the heading of the slide', () => {
    expect(
      renderDocument(
        <Columns>
          <Column heading="Left">
            <Paragraph>Text</Paragraph>
          </Column>
        </Columns>,
      ),
    ).toBe('<div><div><h5>Left</h5><p>Text</p></div></div>');
  });

  it('renders inline callouts as parenthesized side comments', () => {
    expect(
      renderDocument(
        <Paragraph>
          An identity
          <Callout>
            <CalloutTitle>Euler</CalloutTitle> famous
          </Callout>
        </Paragraph>,
      ),
    ).toBe(
      '<p>An identity <small role="note">(<strong>Euler</strong> famous)</small></p>',
    );
  });

  it('links callouts to the elements they point at', () => {
    expect(
      renderDocument(
        <>
          <Paragraph id="target">Target</Paragraph>
          <Callout block anchor="target">
            <Paragraph>Note</Paragraph>
          </Callout>
        </>,
      ),
    ).toBe(
      '<p id="slide-target">Target</p><aside><a href="#slide-target" aria-label="Go to what this points at">→</a> <p>Note</p></aside>',
    );
  });

  it('renders block callouts as asides', () => {
    expect(
      renderDocument(
        <Callout block>
          <Paragraph>Note</Paragraph>
        </Callout>,
      ),
    ).toBe('<aside><p>Note</p></aside>');
  });
});
