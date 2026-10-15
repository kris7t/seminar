import DesktopWindowsIcon from '@mui/icons-material/DesktopWindows';
import LaptopIcon from '@mui/icons-material/Laptop';
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  FormControlLabel,
  FormLabel,
  Radio,
  RadioGroup,
  Typography,
} from '@mui/material';
import { useId, useState, type JSX } from 'react';

import type { ScreenDetailed, ScreenDetails } from './screens.ts';

export interface ScreenDialogProps {
  /** The screens to choose from, or `undefined` if the dialog is closed. */
  screens: ScreenDetails | undefined;
  onChoose: (screen: ScreenDetailed) => void;
  onClose: () => void;
}

function describe(screen: ScreenDetailed, current: boolean): string {
  const details = [
    `${String(screen.width)}×${String(screen.height)}`,
    ...(screen.isPrimary ? ['primary'] : []),
    ...(screen.isInternal ? ['built-in'] : []),
    ...(current ? ['this window is here'] : []),
  ];
  return details.join(', ');
}

/**
 * Asks which screen to show the presentation on, when the device has several.
 *
 * Should be rendered with the {@link uiTheme}.
 */
export function ScreenDialog({
  screens,
  onChoose,
  onClose,
}: ScreenDialogProps): JSX.Element {
  return (
    // A fixed width, so that long names of screens are cut off instead of
    // making the dialog wider.
    <Dialog
      open={screens !== undefined}
      onClose={onClose}
      fullWidth
      maxWidth="xs"
    >
      {/* Remount the form each time the dialog opens to reset it. */}
      {screens !== undefined && (
        <ScreenForm screens={screens} onChoose={onChoose} onClose={onClose} />
      )}
    </Dialog>
  );
}

function ScreenForm({
  screens: { screens, currentScreen },
  onChoose,
  onClose,
}: ScreenDialogProps & { screens: ScreenDetails }): JSX.Element {
  const labelId = useId();
  // Most likely, the presentation goes to the projector, not to the screen
  // the presenter is looking at.
  const [selected, setSelected] = useState(() =>
    Math.max(
      screens.findIndex((screen) => screen !== currentScreen),
      0,
    ),
  );
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        const screen = screens[selected];
        if (screen !== undefined) {
          onChoose(screen);
        }
      }}
    >
      <DialogTitle>Start presentation</DialogTitle>
      <DialogContent>
        <FormControl fullWidth>
          <FormLabel id={labelId} sx={{ mb: 1 }}>
            Show the slides in full screen on:
          </FormLabel>
          <RadioGroup
            aria-labelledby={labelId}
            value={String(selected)}
            // Wrapping columns are as wide as their content, which would keep
            // long names from being cut off.
            sx={{ flexWrap: 'nowrap' }}
            onChange={(event) => {
              setSelected(Number(event.target.value));
            }}
          >
            {screens.map((screen, index) => {
              const Icon = screen.isInternal ? LaptopIcon : DesktopWindowsIcon;
              const name =
                screen.label === ''
                  ? `Screen ${String(index + 1)}`
                  : screen.label;
              return (
                <FormControlLabel
                  // Screens have no ids, and their order is stable.
                  // eslint-disable-next-line @eslint-react/no-array-index-key
                  key={index}
                  value={String(index)}
                  control={
                    <Radio
                      // Arrow keys move the selection from here.
                      autoFocus={index === selected}
                    />
                  }
                  label={
                    <Box
                      sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}
                    >
                      <Icon color="action" sx={{ flex: 'none' }} />
                      <Box sx={{ minWidth: 0 }}>
                        <Typography noWrap title={name}>
                          {name}
                        </Typography>
                        <Typography
                          variant="body2"
                          color="textSecondary"
                          noWrap
                        >
                          {describe(screen, screen === currentScreen)}
                        </Typography>
                      </Box>
                    </Box>
                  }
                  sx={{
                    py: 0.5,
                    mr: 0,
                    // Let the row and its label shrink, so that the text can be
                    // cut off.
                    minWidth: 0,
                    '& .MuiFormControlLabel-label': { minWidth: 0 },
                  }}
                />
              );
            })}
          </RadioGroup>
        </FormControl>
      </DialogContent>
      <DialogActions>
        <Button color="inherit" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit">OK</Button>
      </DialogActions>
    </form>
  );
}
