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
  MenuItem,
  Radio,
  RadioGroup,
  Select,
  Stack,
} from '@mui/material';
import { useState, type JSX, type SyntheticEvent } from 'react';

import { useDeck } from '../deck/DeckContext.ts';
import { useUiLanguage } from '../i18n/UiLanguageContext.ts';
import type { PagesPerSheet, PrintLayout, PrintOptions } from './PrintView.tsx';

const PER_SHEET: readonly PagesPerSheet[] = [2, 4, 6];

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
  const [layout, setLayout] = useState<PrintLayout>('slides');
  const [perSheet, setPerSheet] = useState<PagesPerSheet>(4);
  const [headers, setHeaders] = useState(true);
  const onSubmit = (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    onPrint({ pages, spares: includeSpares, layout, perSheet, headers });
  };
  return (
    <form onSubmit={onSubmit} noValidate>
      <DialogTitle>{t('print')}</DialogTitle>
      <DialogContent>
        <Stack sx={{ gap: 2 }}>
          <FormControl disabled={preparing}>
            <FormLabel id="seminar-print-layout">{t('layout')}</FormLabel>
            <RadioGroup
              aria-labelledby="seminar-print-layout"
              value={layout}
              onChange={(event) => {
                setLayout(event.target.value as PrintLayout);
              }}
            >
              <FormControlLabel
                value="slides"
                control={<Radio />}
                label={t('layoutSlides')}
              />
              <FormControlLabel
                value="notes"
                control={<Radio />}
                label={t('layoutNotes')}
              />
              {/* The number of slides follows the label, without moving the
                  options when the layout changes. */}
              <Stack direction="row" sx={{ alignItems: 'center', gap: 2 }}>
                <FormControlLabel
                  value="grid"
                  control={<Radio />}
                  label={t('layoutGrid')}
                  sx={{ mr: 0 }}
                />
                <Select
                  size="small"
                  value={perSheet}
                  disabled={preparing}
                  onChange={(event) => {
                    setPerSheet(event.target.value);
                    // Choosing a number of slides chooses the layout, too.
                    setLayout('grid');
                  }}
                  inputProps={{ 'aria-label': t('slidesPerSheet') }}
                  sx={{ minWidth: 80 }}
                >
                  {PER_SHEET.map((count) => (
                    <MenuItem key={count} value={count}>
                      {count}
                    </MenuItem>
                  ))}
                </Select>
              </Stack>
            </RadioGroup>
            <FormControlLabel
              // Slides take the whole sheet, without margins for headers.
              disabled={preparing || layout === 'slides'}
              control={
                <Checkbox
                  // Slides are printed without headers, whatever was chosen
                  // for handouts.
                  checked={headers && layout !== 'slides'}
                  onChange={(event) => {
                    setHeaders(event.target.checked);
                  }}
                />
              }
              label={t('headersAndFooters')}
            />
          </FormControl>
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
