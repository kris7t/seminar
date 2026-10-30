import { Box, Button, TextField, Typography } from '@mui/material';
import {
  defineStore,
  useResetSlideState,
  useSlideView,
  useStore,
} from '@seminar/core';
import type { JSX } from 'react';

function parse(value: string): number | undefined {
  const number = Number(value.trim().replace(',', '.'));
  return value.trim() === '' || Number.isNaN(number) ? undefined : number;
}

interface Sum {
  a: string;
  b: string;
  sum: number | undefined;
}

type SumAction = { type: 'a' | 'b'; value: string } | { type: 'compute' };

const sum = defineStore({
  initial: (): Sum => ({ a: '', b: '', sum: undefined }),
  reduce: (state, action: SumAction): Sum => {
    if (action.type !== 'compute') {
      return { ...state, [action.type]: action.value };
    }
    const x = parse(state.a);
    const y = parse(state.b);
    return x === undefined || y === undefined
      ? state
      : { ...state, sum: x + y };
  },
});

/**
 * Adds two numbers, to try interactive widgets in the presenter view. The
 * values are in a slide store, so the audience sees them, too, and Reset
 * resets the state of the slide.
 */
export function Calculator(): JSX.Element {
  const [{ a, b, sum: c }, dispatch] = useStore(sum);
  const reset = useResetSlideState();
  const valid = parse(a) !== undefined && parse(b) !== undefined;
  // Below the headings of the slides in documents.
  const heading = useSlideView().kind === 'document' ? 'h5' : 'h4';
  return (
    <Box
      component="form"
      onSubmit={(event) => {
        event.preventDefault();
        dispatch({ type: 'compute' });
      }}
      sx={{ display: 'flex', alignItems: 'center', gap: 3, mt: 4 }}
    >
      <TextField
        label="A"
        value={a}
        onChange={(event) => {
          dispatch({ type: 'a', value: event.target.value });
        }}
        slotProps={{ htmlInput: { inputMode: 'decimal' } }}
        sx={{ width: 200 }}
      />
      <Typography variant="h4" component={heading}>
        +
      </Typography>
      <TextField
        label="B"
        value={b}
        onChange={(event) => {
          dispatch({ type: 'b', value: event.target.value });
        }}
        slotProps={{ htmlInput: { inputMode: 'decimal' } }}
        sx={{ width: 200 }}
      />
      <Typography variant="h4" component={heading}>
        =
      </Typography>
      <Typography variant="h4" component={heading} sx={{ minWidth: 120 }}>
        {c ?? '?'}
      </Typography>
      <Button type="submit" variant="contained" disabled={!valid}>
        Compute
      </Button>
      <Button onClick={reset}>Reset</Button>
    </Box>
  );
}
