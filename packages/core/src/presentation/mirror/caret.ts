/** A rectangle relative to the padding box of a text field, in CSS pixels. */
export interface TextRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** Styles that affect where the text of a field is laid out. */
const COPIED_PROPERTIES = [
  'direction',
  'box-sizing',
  'width',
  'padding-top',
  'padding-right',
  'padding-bottom',
  'padding-left',
  'border-top-width',
  'border-right-width',
  'border-bottom-width',
  'border-left-width',
  'border-style',
  'font-style',
  'font-variant',
  'font-weight',
  'font-stretch',
  'font-size',
  'font-family',
  'line-height',
  'text-align',
  'text-transform',
  'text-indent',
  'letter-spacing',
  'word-spacing',
  'tab-size',
] as const;

function px(value: string): number {
  const number = Number.parseFloat(value);
  return Number.isNaN(number) ? 0 : number;
}

function lineHeightOf(style: CSSStyleDeclaration): number {
  const lineHeight = Number.parseFloat(style.lineHeight);
  // `normal` depends on the font, but is close to this.
  return Number.isNaN(lineHeight) ? px(style.fontSize) * 1.2 : lineHeight;
}

interface Point {
  left: number;
  top: number;
}

/**
 * Measures where the characters at `positions` of a text field are, by laying
 * out its text in a hidden element with the same styles, since text fields
 * don't tell where their characters are.
 */
function measure(
  field: HTMLInputElement | HTMLTextAreaElement,
  positions: readonly number[],
): Point[] {
  const doc = field.ownerDocument;
  const style = doc.defaultView?.getComputedStyle(field);
  if (style === undefined) {
    return positions.map(() => ({ left: 0, top: 0 }));
  }
  const input = field.nodeName === 'INPUT';
  const mirror = doc.createElement('div');
  for (const property of COPIED_PROPERTIES) {
    mirror.style.setProperty(property, style.getPropertyValue(property));
  }
  Object.assign(mirror.style, {
    position: 'absolute',
    top: '0',
    left: '-9999px',
    visibility: 'hidden',
    overflow: 'hidden',
    whiteSpace: input ? 'pre' : 'pre-wrap',
    overflowWrap: input ? 'normal' : 'break-word',
  });
  doc.body.append(mirror);
  const { value } = field;
  const points = positions.map((position) => {
    mirror.textContent = value.slice(0, position);
    const marker = doc.createElement('span');
    // Something to lay out at the end of the text, too.
    marker.textContent = value.slice(position) || '.';
    mirror.append(marker);
    // Offsets are relative to the padding box of the absolutely positioned
    // mirror, like the result.
    return { left: marker.offsetLeft, top: marker.offsetTop };
  });
  mirror.remove();
  return points;
}

export interface TextFieldOverlay {
  /** The caret, if the selection is empty. */
  caret: TextRect | undefined;
  /** The highlighted rectangles of the selection, if it isn't empty. */
  selection: TextRect[];
}

/**
 * Computes where to draw the caret and the selection of a text field, which
 * browsers only draw in the focused window, relative to the padding box of the
 * field, taking its scroll position into account.
 */
export function textFieldOverlay(
  field: HTMLInputElement | HTMLTextAreaElement,
  selectionStart: number,
  selectionEnd: number,
  backward: boolean,
): TextFieldOverlay {
  const style = field.ownerDocument.defaultView?.getComputedStyle(field);
  if (style === undefined) {
    return { caret: undefined, selection: [] };
  }
  const lineHeight = lineHeightOf(style);
  const input = field.nodeName === 'INPUT';
  // Inputs center their single line vertically.
  const inputTop =
    px(style.paddingTop) +
    (field.clientHeight -
      px(style.paddingTop) -
      px(style.paddingBottom) -
      lineHeight) /
      2;
  const [start, end] = measure(field, [selectionStart, selectionEnd]).map(
    ({ left, top }) => ({
      left: left - field.scrollLeft,
      top: (input ? inputTop : top) - field.scrollTop,
    }),
  );
  if (start === undefined || end === undefined) {
    return { caret: undefined, selection: [] };
  }
  if (selectionStart === selectionEnd) {
    const at = backward ? start : end;
    return {
      caret: { left: at.left, top: at.top, width: 1, height: lineHeight },
      selection: [],
    };
  }
  if (start.top === end.top) {
    return {
      caret: undefined,
      selection: [
        {
          left: start.left,
          top: start.top,
          width: end.left - start.left,
          height: lineHeight,
        },
      ],
    };
  }
  // The selection spans lines of a text area: the rest of the first line,
  // the lines in between, and the beginning of the last line.
  const contentLeft = px(style.paddingLeft);
  const contentRight = field.clientWidth - px(style.paddingRight);
  return {
    caret: undefined,
    selection: [
      {
        left: start.left,
        top: start.top,
        width: contentRight - start.left,
        height: lineHeight,
      },
      {
        left: contentLeft,
        top: start.top + lineHeight,
        width: contentRight - contentLeft,
        height: end.top - start.top - lineHeight,
      },
      {
        left: contentLeft,
        top: end.top,
        width: end.left - contentLeft,
        height: lineHeight,
      },
    ].filter(({ width, height }) => width > 0 && height > 0),
  };
}
