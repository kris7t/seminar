import {
  DragHandle,
  measureInSlide,
  useEditable,
  useEditedProps,
  useMeasure,
  useSlideBox,
  type SlideBox,
} from '@seminar/core';
import {
  Children,
  isValidElement,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
  type JSX,
  type ReactElement,
} from 'react';

import { Column, type ColumnProps } from './Column.tsx';
import { Columns, type ColumnsProps } from './Columns.tsx';
import { resizeColumns, type ResizedColumn } from './columnResize.ts';

/** Props of the `columns` directive in MDX. */
export type ColumnsDirectiveProps = ColumnsProps;

/** Props of the `column` directive in MDX. */
export type ColumnDirectiveProps = ColumnProps;

/** Where a column is in its row, in logical slide pixels. */
interface ColumnBox extends SlideBox {
  /** Whether it's shown, rather than a step that is hidden. */
  shown: boolean;
}

/** Where the columns of a row are, in logical slide pixels. */
interface RowLayout {
  row: SlideBox;
  columns: ColumnBox[];
}

function sameBoxes(a: readonly ColumnBox[], b: readonly ColumnBox[]): boolean {
  return (
    a.length === b.length &&
    a.every(
      (box, index) =>
        box.x === b[index]?.x &&
        box.y === b[index].y &&
        box.width === b[index].width &&
        box.height === b[index].height &&
        box.shown === b[index].shown,
    )
  );
}

/**
 * Returns where the columns in `root` are while `measured`: when it's
 * rendered, moved, or resized, and when the columns are resized, or their
 * steps are shown or hidden.
 */
function useRowLayout(
  root: HTMLElement | null,
  measured: boolean,
): RowLayout | undefined {
  const element = measured ? (root ?? undefined) : undefined;
  const row = useSlideBox(element);
  // Relative to the row, so that they only change when the columns do.
  const [columns, setColumns] = useState<ColumnBox[]>([]);
  const measure = () => {
    const rowBox = element && measureInSlide(element);
    const next =
      element === undefined || rowBox === undefined
        ? []
        : [...element.children].flatMap((child) => {
            const box = measureInSlide(child);
            return box === undefined
              ? []
              : [
                  {
                    ...box,
                    x: box.x - rowBox.x,
                    y: box.y - rowBox.y,
                    shown: getComputedStyle(child).visibility !== 'hidden',
                  },
                ];
          });
    setColumns((previous) => (sameBoxes(previous, next) ? previous : next));
  };
  useMeasure(element, measure);
  const onResize = useEffectEvent(measure);
  useEffect(() => {
    if (element === undefined || typeof ResizeObserver === 'undefined') {
      return undefined;
    }
    const observer = new ResizeObserver(() => {
      onResize();
    });
    // Steps are shown and hidden by their classes.
    const steps = new MutationObserver(() => {
      onResize();
    });
    for (const child of element.children) {
      observer.observe(child);
      steps.observe(child, { attributes: true, attributeFilter: ['class'] });
    }
    return () => {
      observer.disconnect();
      steps.disconnect();
    };
  }, [element, columns.length]);
  return row === undefined
    ? undefined
    : {
        row,
        columns: columns.map((box) => ({
          ...box,
          x: box.x + row.x,
          y: box.y + row.y,
        })),
      };
}

/**
 * The `columns` directive of MDX decks, a row of {@link Columns}, e.g.,
 * `::::columns` around `:::column`s, or the row that consecutive `:::column`s
 * are wrapped in without one. While the slide is edited, the columns next to
 * each other can be resized by dragging between them.
 */
export function ColumnsDirective(props: ColumnsDirectiveProps): JSX.Element {
  const editable = useEditable(props);
  const [root, setRoot] = useState<HTMLDivElement | null>(null);
  const columns = Children.toArray(props.children).filter(
    (child): child is ReactElement<ColumnProps> =>
      isValidElement<ColumnProps>(child),
  );
  const layout = useRowLayout(root, editable !== undefined);
  // The columns next to the dragged divider, as they were when it began.
  const draggedRef = useRef<[ResizedColumn, ResizedColumn]>(undefined);
  const resized = (index: number): ResizedColumn | undefined => {
    const box = layout?.columns[index];
    const column = columns[index];
    const target = column && editable?.of(column);
    return box === undefined || target === undefined
      ? undefined
      : {
          width: box.width,
          fixed: target.props.width,
          grow: target.props.grow,
        };
  };
  return (
    <>
      <Columns ref={setRoot} {...props} />
      {editable !== undefined &&
        layout?.columns.slice(1).map((right, index) => {
          const left = layout.columns[index];
          const leftColumn = columns[index];
          const rightColumn = columns[index + 1];
          // Hidden columns keep their room, so they're resized along with
          // the columns next to them, but not between themselves.
          if (
            left === undefined ||
            leftColumn === undefined ||
            rightColumn === undefined ||
            (!left.shown && !right.shown)
          ) {
            return null;
          }
          const resize = (dx: number, fine: boolean) => {
            if (draggedRef.current === undefined) {
              return;
            }
            const [leftChanges, rightChanges] = resizeColumns(
              ...draggedRef.current,
              dx,
              layout.row.width,
              fine,
            );
            editable.of(leftColumn)?.preview(leftChanges);
            editable.of(rightColumn)?.preview(rightChanges);
          };
          const x = left.x + left.width;
          return (
            <DragHandle
              key={index}
              editable={editable}
              box={{
                x,
                y: layout.row.y,
                width: right.x - x,
                height: layout.row.height,
              }}
              shape="vertical"
              label="Resize the columns"
              onDragStart={() => {
                const leftResized = resized(index);
                const rightResized = resized(index + 1);
                draggedRef.current =
                  leftResized === undefined || rightResized === undefined
                    ? undefined
                    : [leftResized, rightResized];
              }}
              onDrag={({ dx, shiftKey }) => {
                resize(dx, shiftKey);
              }}
              onRelease={({ dx, shiftKey }) => {
                resize(dx, shiftKey);
                draggedRef.current = undefined;
                editable.commit();
              }}
              onCancel={() => {
                draggedRef.current = undefined;
                editable.cancel();
              }}
            />
          );
        })}
    </>
  );
}

/**
 * The `column` directive of MDX decks, a {@link Column} of a
 * {@link ColumnsDirective}, which shows its size while it's resized.
 */
export function ColumnDirective(props: ColumnDirectiveProps): JSX.Element {
  return <Column {...useEditedProps(props)} />;
}
