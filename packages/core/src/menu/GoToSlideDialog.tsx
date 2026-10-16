import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import {
  useRef,
  useState,
  type JSX,
  type RefObject,
  type SyntheticEvent,
} from 'react';

import { useDeck } from '../deck/DeckContext.ts';
import { useUiLanguage } from '../i18n/UiLanguageContext.ts';

export interface GoToSlideDialogProps {
  open: boolean;
  onClose: () => void;
}

/** Asks for the number of a slide to go to. */
export function GoToSlideDialog({
  open,
  onClose,
}: GoToSlideDialogProps): JSX.Element {
  const { lang } = useUiLanguage();
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <Dialog
      open={open}
      onClose={onClose}
      slotProps={{
        paper: { lang },
        transition: {
          // When opened from the context menu, the menu takes the focus back
          // as it closes, so focus the input again once the dialog is shown.
          onEntered: () => {
            if (document.activeElement !== inputRef.current) {
              inputRef.current?.focus();
            }
          },
        },
      }}
    >
      {/* Remount the form each time the dialog opens to reset it. */}
      {open && <GoToSlideForm inputRef={inputRef} onClose={onClose} />}
    </Dialog>
  );
}

function GoToSlideForm({
  inputRef,
  onClose,
}: {
  inputRef: RefObject<HTMLInputElement | null>;
  onClose: () => void;
}): JSX.Element {
  const { t } = useUiLanguage();
  const { slideIndex, slideCount, goTo } = useDeck();
  const [value, setValue] = useState(String(slideIndex + 1));
  const slideNumber = Number(value);
  const valid =
    Number.isInteger(slideNumber) &&
    slideNumber >= 1 &&
    slideNumber <= slideCount;

  const onSubmit = (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (valid) {
      goTo(slideNumber - 1);
      onClose();
    }
  };

  return (
    <form onSubmit={onSubmit} noValidate>
      <DialogTitle>{t('goToSlide')}</DialogTitle>
      <DialogContent>
        <Stack direction="row" sx={{ alignItems: 'center', gap: 1 }}>
          <TextField
            inputRef={inputRef}
            // Focus right away, so that typing `:12` and Enter quickly works.
            autoFocus
            onFocus={(event) => {
              event.target.select();
            }}
            size="small"
            type="number"
            value={value}
            onChange={(event) => {
              setValue(event.target.value);
            }}
            error={!valid}
            sx={{ width: '7em' }}
            slotProps={{
              htmlInput: {
                'aria-label': t('slideNumber'),
                min: 1,
                max: slideCount,
                step: 1,
              },
            }}
          />
          <Typography color="textSecondary">/ {slideCount}</Typography>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button color="inherit" onClick={onClose}>
          {t('cancel')}
        </Button>
        <Button type="submit" disabled={!valid}>
          {t('ok')}
        </Button>
      </DialogActions>
    </form>
  );
}
