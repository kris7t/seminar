import { cleanup, render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Deck } from '../deck/Deck.tsx';
import { Slide } from '../slide/Slide.tsx';
import { SlideViewProvider } from './SlideViewProvider.tsx';
import type { SlideViewKind } from './SlideViewContext.ts';

let broken = true;

function Broken(): string {
  if (broken) throw new Error('Slide is broken');
  return 'Slide is fixed';
}

describe('SlideErrorBoundary', () => {
  beforeEach(() => {
    window.history.replaceState(null, '', '#');
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    broken = true;
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('shows the error of a slide, and the rest of the deck keeps working', async () => {
    const user = userEvent.setup();
    render(
      <Deck>
        <Slide title="First">
          <Broken />
        </Slide>
        <Slide title="Second">Works</Slide>
      </Deck>,
    );
    const alert = screen.getByRole('alert');
    expect(alert.textContent).toContain("This slide can't be shown");
    expect(alert.textContent).toContain('Slide is broken');
    await user.keyboard('{PageDown}');
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByText('Works')).toBeDefined();
  });

  it('renders the slide again when it is shown again', async () => {
    const user = userEvent.setup();
    render(
      <Deck>
        <Slide title="First">
          <Broken />
        </Slide>
        <Slide title="Second" />
      </Deck>,
    );
    await user.keyboard('{PageDown}');
    broken = false;
    await user.keyboard('{PageUp}');
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByText('Slide is fixed')).toBeDefined();
  });

  it('shows values thrown other than errors', () => {
    function Throws(): null {
      // eslint-disable-next-line @typescript-eslint/only-throw-error
      throw 'Just a string';
    }
    render(
      <SlideViewProvider
        view={{ index: 0, kind: 'audience', interactive: true }}
      >
        <Throws />
      </SlideViewProvider>,
    );
    expect(screen.getByRole('alert').textContent).toContain('Just a string');
  });

  it.each<SlideViewKind>(['thumbnail', 'probe', 'print', 'document'])(
    'leaves errors in %s views to the code that renders them',
    (kind) => {
      expect(() =>
        render(
          <SlideViewProvider view={{ index: 0, kind, interactive: false }}>
            <Broken />
          </SlideViewProvider>,
        ),
      ).toThrow('Slide is broken');
    },
  );
});
