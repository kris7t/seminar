import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it } from 'vitest';

import SlidePreview from './SlidePreview.tsx';

afterEach(cleanup);

it('starts on the second step, keeping upcoming bullets in the preview', () => {
  render(<SlidePreview imageSrc="/talk.webp" />);
  expect(screen.getByRole('status').textContent).toBe(
    'Step 2 of 3 · Slide 1 of 2',
  );
  const bullets = screen.getAllByRole('listitem');
  expect(bullets).toHaveLength(3);
  expect(bullets.map((bullet) => bullet.dataset['upcoming'])).toEqual([
    'false',
    'false',
    'true',
  ]);
  expect(screen.queryByRole('img')).toBeNull();
});

it('advances through steps and slides by clicking the preview or Next', async () => {
  const user = userEvent.setup();
  render(<SlidePreview imageSrc="/talk.webp" />);
  await user.click(screen.getByRole('group', { name: 'Example slides' }));
  expect(screen.getByRole('status').textContent).toBe(
    'Step 3 of 3 · Slide 1 of 2',
  );
  expect(
    screen
      .getAllByRole('listitem')
      .every((item) => item.dataset['upcoming'] === 'false'),
  ).toBe(true);
  await user.click(screen.getByRole('button', { name: 'Next step' }));
  expect(screen.getByRole('status').textContent).toBe('Slide 2 of 2');
  expect(
    screen
      .getByRole('img', { name: 'Person giving a talk' })
      .getAttribute('src'),
  ).toBe('/talk.webp');
  expect(screen.queryByRole('list')).toBeNull();
  expect(
    screen.getByRole('button', { name: 'Next step' }).hasAttribute('disabled'),
  ).toBe(true);
  await user.click(screen.getByRole('group', { name: 'Example slides' }));
  expect(screen.getByRole('status').textContent).toBe(
    'Step 1 of 3 · Slide 1 of 2',
  );
  expect(
    screen.getAllByRole('listitem').map((item) => item.dataset['upcoming']),
  ).toEqual(['false', 'true', 'true']);
  expect(
    screen
      .getByRole('button', { name: 'Previous step' })
      .hasAttribute('disabled'),
  ).toBe(true);
  expect(
    screen.getByRole('button', { name: 'Next step' }).hasAttribute('disabled'),
  ).toBe(false);
});

it('goes back through the last step of the first slide and stops at the beginning', async () => {
  const user = userEvent.setup();
  render(<SlidePreview imageSrc="/talk.webp" />);
  const next = screen.getByRole('button', { name: 'Next step' });
  const previous = screen.getByRole('button', { name: 'Previous step' });
  await user.click(next);
  await user.click(next);
  await user.click(previous);
  expect(screen.getByRole('status').textContent).toBe(
    'Step 3 of 3 · Slide 1 of 2',
  );
  await user.click(previous);
  await user.click(previous);
  expect(screen.getByRole('status').textContent).toBe(
    'Step 1 of 3 · Slide 1 of 2',
  );
  expect(previous.hasAttribute('disabled')).toBe(true);
  await user.click(previous);
  expect(screen.getByRole('status').textContent).toBe(
    'Step 1 of 3 · Slide 1 of 2',
  );
});

it('supports keyboard navigation with native buttons and arrow keys', async () => {
  const user = userEvent.setup();
  render(<SlidePreview imageSrc="/talk.webp" />);
  const preview = screen.getByRole('region', {
    name: 'Interactive presentation preview',
  });
  const previous = within(preview).getByRole('button', {
    name: 'Previous step',
  });
  previous.focus();
  await user.keyboard('{Enter}');
  expect(screen.getByRole('status').textContent).toBe(
    'Step 1 of 3 · Slide 1 of 2',
  );
  const next = within(preview).getByRole('button', { name: 'Next step' });
  next.focus();
  await user.keyboard(' ');
  expect(screen.getByRole('status').textContent).toBe(
    'Step 2 of 3 · Slide 1 of 2',
  );
  await user.keyboard('{ArrowRight}');
  expect(screen.getByRole('status').textContent).toBe(
    'Step 3 of 3 · Slide 1 of 2',
  );
  await user.keyboard('{ArrowLeft}');
  expect(screen.getByRole('status').textContent).toBe(
    'Step 2 of 3 · Slide 1 of 2',
  );
});
