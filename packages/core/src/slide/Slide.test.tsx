import { cleanup, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Deck } from '../deck/Deck.tsx';
import { sectionMasterClasses } from '../masters/SectionMaster.tsx';
import type { SlideMasterProps } from '../masters/SlideMaster.ts';
import { subsectionMasterClasses } from '../masters/SubsectionMaster.tsx';
import { Slide } from './Slide.tsx';
import { createSlideTheme } from '../theme/createSlideTheme.ts';

function CustomMaster({ title, children }: SlideMasterProps) {
  return (
    <div data-testid="custom">
      <h1>{title}</h1>
      {children}
    </div>
  );
}

describe('Slide', () => {
  beforeEach(() => {
    window.history.replaceState(null, '', '#');
  });

  afterEach(() => {
    cleanup();
  });

  function renderSlide(slide: ReactNode) {
    return render(
      <Deck theme={createSlideTheme({ master: { custom: CustomMaster } })}>
        {slide}
      </Deck>,
    );
  }

  it('uses the content master by default', () => {
    renderSlide(<Slide title="Content">Body</Slide>);
    expect(screen.getByRole('heading').textContent).toBe('Content');
    expect(screen.getByText('Body')).toBeDefined();
    expect(screen.getByText('1 / 1')).toBeDefined();
  });

  it('uses the title master', () => {
    renderSlide(
      <Slide master="title" title="Talk">
        Speaker
      </Slide>,
    );
    expect(screen.getByRole('heading').tagName).toBe('H1');
    expect(screen.getByRole('heading').textContent).toBe('Talk');
    expect(screen.getByText('Speaker')).toBeDefined();
  });

  it.each([
    ['section', sectionMasterClasses.root],
    ['subsection', subsectionMasterClasses.root],
  ])('uses the %s master', (master, className) => {
    renderSlide(
      <Slide master={master} title="Part">
        Summary
      </Slide>,
    );
    expect(screen.getByRole('heading').textContent).toBe('Part');
    expect(screen.getByText('Summary').closest(`.${className}`)).not.toBeNull();
  });

  it('uses a master added to the theme', () => {
    renderSlide(<Slide master="custom" title="Custom" />);
    expect(screen.getByTestId('custom').textContent).toBe('Custom');
  });

  it('uses a master passed as a component', () => {
    renderSlide(<Slide master={CustomMaster} title="Component" />);
    expect(screen.getByTestId('custom').textContent).toBe('Component');
  });

  it('rejects unknown masters', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    renderSlide(<Slide master="missing" />);
    expect(screen.getByRole('alert').textContent).toContain(
      'Unknown slide master: missing',
    );
  });
});
