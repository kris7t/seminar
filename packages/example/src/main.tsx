// Roboto is the default font of MUI. Bundle it so that the presentation works offline.
import '@fontsource/roboto/300.css';
import '@fontsource/roboto/300-italic.css';
import '@fontsource/roboto/400.css';
import '@fontsource/roboto/400-italic.css';
import '@fontsource/roboto/500.css';
import '@fontsource/roboto/500-italic.css';
import '@fontsource/roboto/700.css';
import '@fontsource/roboto/700-italic.css';

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { ExampleDeck } from './ExampleDeck.tsx';

const container = document.getElementById('root');
if (container === null) {
  throw new Error('Missing #root element');
}

createRoot(container).render(
  <StrictMode>
    <ExampleDeck />
  </StrictMode>,
);
