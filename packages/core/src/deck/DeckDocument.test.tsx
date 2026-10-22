import { renderToStaticMarkup } from 'react-dom/server';
import type { JSX } from 'react';
import { describe, expect, it } from 'vitest';

import { Paragraph } from '../content/Paragraph.tsx';
import { Notes } from '../notes/Notes.tsx';
import { Slide } from '../slide/Slide.tsx';
import { Step } from '../steps/Step.tsx';
import { useSteps } from '../steps/useSteps.ts';
import { useSlideState } from '../state/useSlideState.ts';
import { useOwnAnimation } from '../transitions/SlideTransitions.ts';
import { Deck } from './Deck.tsx';
import { DeckDocument } from './DeckDocument.tsx';

function link(anchor: string) {
  return ` <a href="#${anchor}" aria-label="Link to this slide">#</a>`;
}

function Counter(): JSX.Element {
  const { ref, stepIndex } = useSteps(3);
  const [count] = useSlideState(0);
  return (
    <span ref={ref}>{`step ${String(stepIndex)}, count ${String(count)}`}</span>
  );
}

function Animated(): JSX.Element {
  return <div style={useOwnAnimation()}>Moving</div>;
}

describe('DeckDocument', () => {
  it('renders slides as headings by their master', () => {
    const html = renderToStaticMarkup(
      <DeckDocument>
        <Deck lang="en">
          <Slide master="title" title="Talk" id="talk">
            <Paragraph>By someone</Paragraph>
          </Slide>
          <Slide master="section" title="Part" />
          <Slide master="subsection" title="Detail" />
          <Slide title="Content" id="content" />
          <Slide id="untitled" />
        </Deck>
      </DeckDocument>,
    );
    expect(html).toBe(
      `<section><h1 id="talk">Talk${link('talk')}</h1><p>By someone</p></section>` +
        `<section><h2 id="slide=2">Part${link('slide=2')}</h2></section>` +
        `<section><h3 id="slide=3">Detail${link('slide=3')}</h3></section>` +
        `<section><h4 id="content">Content${link('content')}</h4></section>` +
        `<section><h4 id="untitled">Slide 5${link('untitled')}</h4></section>`,
    );
  });

  it('renders every step without its styles', () => {
    const html = renderToStaticMarkup(
      <DeckDocument>
        <Deck>
          <Slide title="Steps">
            <Step>First</Step>
            <Step behavior="only">
              <Step component="span">Nested</Step>
            </Step>
          </Slide>
        </Deck>
      </DeckDocument>,
    );
    expect(html).toContain('<div>First</div><div><span>Nested</span></div>');
  });

  it('renders components at the start of their slide', () => {
    const html = renderToStaticMarkup(
      <DeckDocument>
        <Deck>
          <Slide title="Counter">
            <Counter />
          </Slide>
        </Deck>
      </DeckDocument>,
    );
    expect(html).toContain('<span>step -1, count 0</span>');
  });

  it('renders components that animate themselves without their styles', () => {
    const html = renderToStaticMarkup(
      <DeckDocument>
        <Deck>
          <Slide title="Animated">
            <Animated />
          </Slide>
        </Deck>
      </DeckDocument>,
    );
    expect(html).toContain('<div>Moving</div>');
  });

  it('renders notes after their slide, in its section', () => {
    const html = renderToStaticMarkup(
      <DeckDocument>
        <Deck lang="en">
          <Slide title="Noted">
            <Paragraph>Shown</Paragraph>
            <Notes>
              <p>Said</p>
            </Notes>
          </Slide>
        </Deck>
      </DeckDocument>,
    );
    expect(html).toMatch(
      /<p>Shown<\/p><aside data-seminar-notes="" aria-labelledby="([^"]+)"><h5 id="\1">Presenter notes<\/h5><p>Said<\/p><\/aside><\/section>$/,
    );
  });

  it('links recaps to the slides they recap', () => {
    const html = renderToStaticMarkup(
      <DeckDocument>
        <Deck>
          <Slide master="section" title="Original" id="original">
            <Paragraph>Content</Paragraph>
            <Notes>Notes</Notes>
          </Slide>
          <Slide recap="original" />
        </Deck>
      </DeckDocument>,
    );
    expect(html).toMatch(
      new RegExp(
        `</aside></section><section><h2 id="original-recap">Original${link('original-recap')}</h2>` +
          '<p>Recap of <a href="#original">Original</a></p></section>$',
      ),
    );
  });

  it('marks slides in other languages', () => {
    const html = renderToStaticMarkup(
      <DeckDocument>
        <Deck lang="en">
          <Slide title="English" id="english" />
          <Slide title="Deutsch" id="deutsch" lang="de">
            <Notes>Gesagt</Notes>
          </Slide>
        </Deck>
      </DeckDocument>,
    );
    expect(html).toMatch(
      /^<section><h4 id="english">English.*<\/h4><\/section><section lang="de"><h4 id="deutsch">Deutsch <a href="#deutsch" aria-label="Link to this slide" lang="en">#<\/a><\/h4><aside data-seminar-notes="" aria-labelledby="[^"]+"><h5 id="[^"]+" lang="en">Presenter notes<\/h5>Gesagt<\/aside><\/section>$/,
    );
  });
});
