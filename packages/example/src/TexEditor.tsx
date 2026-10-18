import { Box, TextField } from '@mui/material';
import { useSlideState } from '@slider/core';
import { DynamicFormula } from '@slider/plugin-mathjax/dynamic';
import { useState, type JSX } from 'react';

/**
 * Renders the TeX typed into a field, to try math rendered in the browser.
 * The TeX is slide state, so the audience sees it, too.
 */
export function TexEditor(): JSX.Element {
  const [tex, setTex] = useSlideState('\\sum_{k=1}^{n} k = \\frac{n(n+1)}{2}');
  const [error, setError] = useState<string>();
  return (
    <Box sx={{ mt: 4 }}>
      <TextField
        label="TeX"
        value={tex}
        onChange={(event) => {
          setTex(event.target.value);
          setError(undefined);
        }}
        error={error !== undefined}
        helperText={error ?? ' '}
        fullWidth
        slotProps={{ htmlInput: { spellCheck: false } }}
      />
      <DynamicFormula tex={tex} display onError={setError} />
    </Box>
  );
}
