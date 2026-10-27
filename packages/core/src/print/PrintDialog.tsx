import {
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  FormControl,
  FormControlLabel,
  FormLabel,
  LinearProgress,
  Radio,
  RadioGroup,
  Stack,
} from '@mui/material';
import { useState, type JSX, type SyntheticEvent } from 'react';

import { useDeck } from '../deck/DeckContext.ts';
import { useUiLanguage } from '../i18n/UiLanguageContext.ts';
import type { PrintOptions } from './PrintView.tsx';

export interface PrintDialogProps {
  open: boolean;
  /** Whether the pages are being prepared for printing. */
  preparing: boolean;
  onPrint: (options: PrintOptions) => void;
  /** Closes the dialog, and stops preparing the pages. */
  onClose: () => void;
}

/**
 * Asks how to print the deck, and shows that its pages are being prepared
 * until the print dialog of the browser opens, e.g., to save them as a PDF.
 *
 * Should be rendered with the {@link uiTheme}.
 */
export function PrintDialog({
  open,
  preparing,
  onPrint,
  onClose,
}: PrintDialogProps): JSX.Element {
  const { lang } = useUiLanguage();
  return (
    <Dialog open={open} onClose={onClose} slotProps={{ paper: { lang } }}>
      {/* Remount the form each time the dialog opens to reset it. */}
      {open && (
        <PrintForm preparing={preparing} onPrint={onPrint} onClose={onClose} />
      )}
    </Dialog>
  );
}

function PrintForm({
  preparing,
  onPrint,
  onClose,
}: Omit<PrintDialogProps, 'open'>): JSX.Element {
  const { t } = useUiLanguage();
  const { spares } = useDeck();
  const [pages, setPages] = useState<PrintOptions['pages']>('split');
  const [includeSpares, setIncludeSpares] = useState(false);
  const onSubmit = (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    onPrint({ pages, spares: includeSpares });
  };
  return (
    <form onSubmit={onSubmit} noValidate>
      <DialogTitle>{t('print')}</DialogTitle>
      <DialogContent>
        <Stack sx={{ gap: 2 }}>
          <FormControl disabled={preparing}>
            <FormLabel id="seminar-print-pages">{t('pages')}</FormLabel>
            <RadioGroup
              aria-labelledby="seminar-print-pages"
              value={pages}
              onChange={(event) => {
                setPages(event.target.value as PrintOptions['pages']);
              }}
            >
              <FormControlLabel
                value="split"
                control={<Radio />}
                label={t('splitPages')}
              />
              <FormControlLabel
                value="steps"
                control={<Radio />}
                label={t('everyStep')}
              />
            </RadioGroup>
          </FormControl>
          {spares.includes(true) && (
            <FormControlLabel
              disabled={preparing}
              control={
                <Checkbox
                  checked={includeSpares}
                  onChange={(event) => {
                    setIncludeSpares(event.target.checked);
                  }}
                />
              }
              label={t('includeSpareSlides')}
            />
          )}
          {preparing && (
            <>
              <DialogContentText>{t('preparingPages')}</DialogContentText>
              <LinearProgress aria-label={t('preparingPages')} />
            </>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button color="inherit" onClick={onClose}>
          {t('cancel')}
        </Button>
        <Button type="submit" disabled={preparing}>
          {t('print')}
        </Button>
      </DialogActions>
    </form>
  );
}
