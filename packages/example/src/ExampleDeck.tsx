import { Box, Link, Stack, Typography } from '@mui/material';
import { Deck, Slide, Step, Together, Steps } from '@slider/core';
import type { JSX } from 'react';

import { ClosingMaster, theme } from './theme.tsx';

export function ExampleDeck(): JSX.Element {
  return (
    <Deck theme={theme}>
      <Slide master="title" title="slider">
        <Typography variant="subtitle1">
          Scientific talks and lectures in Markdown
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Use the arrow keys, Page Up / Page Down or Space to navigate.
        </Typography>
      </Slide>
      <Slide id="why" title="Why slider?">
        <ul>
          <li>Keep your slides in plain text under version control</li>
          <li>Write content in Markdown, style it with themes</li>
          <li>Present from any modern web browser</li>
        </ul>
      </Slide>
      <Slide id="steps" title="Revealing content in steps">
        <ul>
          <Step component="li" with="first">
            Some bullet points are visible up front
          </Step>
          <Step component="li">others appear one by one</Step>
          <Step component="li">
            Steps can be nested
            <ul>
              <Step component="li">inside other steps</Step>
              <Step component="li">to any depth</Step>
            </ul>
          </Step>
          <Together>
            <Step component="li">Several items</Step>
            <Step component="li">can appear at once</Step>
          </Together>
          <Step component="li" with="previous">
            together with the previous step
          </Step>
        </ul>
        <Steps count={3} sx={{ display: 'flex', gap: 2, mt: 2 }}>
          {({ stepIndex }) =>
            ['Data', 'Model', 'Results'].map((label, i) => (
              <Box
                key={label}
                sx={{
                  px: 3,
                  py: 1,
                  borderRadius: 1,
                  bgcolor: i === stepIndex ? 'primary.main' : 'action.hover',
                  color: i === stepIndex ? 'primary.contrastText' : undefined,
                }}
              >
                {label}
              </Box>
            ))
          }
        </Steps>
      </Slide>
      <Slide id="theming" master="section" title="Theming">
        <Typography variant="subtitle1">
          Slide masters and MUI themes
        </Typography>
      </Slide>
      <Slide title="Theming with MUI">
        <Stack direction="row" sx={{ gap: 4, height: '100%' }}>
          <Box sx={{ flex: 1 }}>
            <Typography>
              Slides use the MUI theme passed to the <code>Deck</code>, so
              palettes and typography can be adjusted in one place.
            </Typography>
          </Box>
          <Stack sx={{ flex: 1, gap: 2 }}>
            {(['primary', 'secondary'] as const).map((color) => (
              <Box
                key={color}
                sx={{
                  p: 3,
                  borderRadius: 2,
                  bgcolor: `${color}.main`,
                  color: `${color}.contrastText`,
                }}
              >
                <Typography variant="h5" component="p">
                  {color}
                </Typography>
              </Box>
            ))}
          </Stack>
        </Stack>
      </Slide>
      <Slide master={ClosingMaster} title="Thank you!">
        <Typography variant="subtitle1">Questions?</Typography>
        <Typography variant="body2">
          Back to <Link href="#why">Why slider?</Link> or{' '}
          <Link href="#slide=1">the beginning</Link>
        </Typography>
      </Slide>
    </Deck>
  );
}
