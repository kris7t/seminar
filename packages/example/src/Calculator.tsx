import { Box, Button, TextField, Typography } from '@mui/material';
import { useResetSlideState, useSlideState } from '@slider/core';
import type { JSX } from 'react';

function parse(value: string): number | undefined {
  const number = Number(value.trim().replace(',', '.'));
  return value.trim() === '' || Number.isNaN(number) ? undefined : number;
}

/**
 * Adds two numbers, to try interactive widgets in the presenter view. The
 * values are slide state, so the audience sees them, too, and Reset resets
 * the state of the slide.
 */
export function Calculator(): JSX.Element {
  const [a, setA] = useSlideState('');
  const [b, setB] = useSlideState('');
  const [c, setC] = useSlideState<number | undefined>(undefined);
  const reset = useResetSlideState();
  const valid = parse(a) !== undefined && parse(b) !== undefined;
  return (
    <Box
      component="form"
      onSubmit={(event) => {
        event.preventDefault();
        const x = parse(a);
        const y = parse(b);
        if (x !== undefined && y !== undefined) {
          setC(x + y);
        }
      }}
      sx={{ display: 'flex', alignItems: 'center', gap: 3, mt: 4 }}
    >
      <TextField
        label="A"
        value={a}
        onChange={(event) => {
          setA(event.target.value);
        }}
        slotProps={{ htmlInput: { inputMode: 'decimal' } }}
        sx={{ width: 200 }}
      />
      <Typography variant="h4">+</Typography>
      <TextField
        label="B"
        value={b}
        onChange={(event) => {
          setB(event.target.value);
        }}
        slotProps={{ htmlInput: { inputMode: 'decimal' } }}
        sx={{ width: 200 }}
      />
      <Typography variant="h4">=</Typography>
      <Typography variant="h4" sx={{ minWidth: 120 }}>
        {c ?? '?'}
      </Typography>
      <Button type="submit" variant="contained" disabled={!valid}>
        Compute
      </Button>
      <Button onClick={reset}>Reset</Button>
    </Box>
  );
}
