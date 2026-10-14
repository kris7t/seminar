import './fonts.ts';

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { theme } from './theme.tsx';
import Talk from './talk.deck.mdx';

const container = document.getElementById('root');
if (container === null) {
  throw new Error('Missing #root element');
}

createRoot(container).render(
  <StrictMode>
    <Talk theme={theme} />
  </StrictMode>,
);
