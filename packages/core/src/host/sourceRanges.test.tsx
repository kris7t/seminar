import { cleanup, render } from '@testing-library/react';
import {
  Children,
  cloneElement,
  Component,
  forwardRef,
  lazy,
  memo,
  StrictMode,
  Suspense,
  useState,
  type JSX,
  type ReactElement,
  type ReactNode,
} from 'react';
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  __seminarAt,
  findSourceRange,
  findSourceRangeOf,
  getSourceRange,
  withSourceOf,
  type SourceRange,
} from './sourceRanges.ts';

function range(line: number): SourceRange {
  return {
    start: { line, column: 1 },
    end: { line, column: 5 },
  };
}

const at = (element: ReactElement<object>, line: number) =>
  __seminarAt(element, `${String(line)}:1-${String(line)}:5`);

describe('source ranges', () => {
  let found: Map<string, SourceRange | undefined>;

  beforeEach(() => {
    found = new Map();
  });

  afterEach(cleanup);

  /** Stands in for a stepper inside a component. */
  function Inner({ name }: { name: string }): null {
    found.set(name, findSourceRange());
    return null;
  }

  function DropsProps({ name }: { name: string }): JSX.Element {
    return <Inner name={name} />;
  }

  it('reads the range of an element', () => {
    const element = at(<p />, 3);
    expect(getSourceRange(element.props)).toEqual(range(3));
    expect(getSourceRange({})).toBeUndefined();
  });

  it('returns the element itself, with no props of its own', () => {
    const element: ReactElement<object> = <p title="a" />;
    const returned = at(element, 3);
    expect(returned).toBe(element);
    expect(Object.keys(returned.props)).toEqual(['title']);
  });

  it('ignores malformed ranges', () => {
    const element: ReactElement<object> = __seminarAt(<p />, 'nowhere');
    expect(getSourceRange(element.props)).toBeUndefined();
  });

  it('finds the range through components that drop their props', () => {
    render(<StrictMode>{at(<DropsProps name="a" />, 1)}</StrictMode>);
    expect(found.get('a')).toEqual(range(1));
  });

  it('finds the range through other kinds of components', async () => {
    const Memo = memo(DropsProps);
    // eslint-disable-next-line @eslint-react/no-forward-ref
    const Ref = forwardRef<HTMLElement, { name: string }>(function Ref(props) {
      return <DropsProps {...props} />;
    });
    const Lazy = lazy(() => Promise.resolve({ default: DropsProps }));
    class Class extends Component<{ name: string; other?: number }> {
      static defaultProps = { other: 1 };

      override render(): ReactNode {
        return <DropsProps name={this.props.name} />;
      }
    }
    await act(async () => {
      render(
        <Suspense fallback={null}>
          {at(<Memo name="memo" />, 1)}
          {at(<Ref name="ref" />, 2)}
          {at(<Lazy name="lazy" />, 3)}
          {at(<Class name="class" />, 4)}
        </Suspense>,
      );
      await Promise.resolve();
    });
    expect(found.get('memo')).toEqual(range(1));
    expect(found.get('ref')).toEqual(range(2));
    expect(found.get('lazy')).toEqual(range(3));
    expect(found.get('class')).toEqual(range(4));
  });

  it('finds the closest range', () => {
    render(
      at(
        <div>
          {at(<DropsProps name="own" />, 2)}
          <DropsProps name="enclosing" />
        </div>,
        1,
      ),
    );
    expect(found.get('own')).toEqual(range(2));
    expect(found.get('enclosing')).toEqual(range(1));
  });

  it('finds nothing without a range', () => {
    render(<DropsProps name="a" />);
    expect(found.get('a')).toBeUndefined();
  });

  it('tells the file', () => {
    const element = __seminarAt(
      <p />,
      '1:1-1:5',
      '/deck.mdx',
    ) as ReactElement<object>;
    expect(getSourceRange(element.props)?.file).toBe('/deck.mdx');
  });

  it('finds the closest range of a DOM element', () => {
    const { container } = render(
      at(
        <div>
          {at(
            <p>
              <em>text</em>
            </p>,
            2,
          )}
          <b />
        </div>,
        1,
      ),
    );
    const em = container.querySelector('em');
    const b = container.querySelector('b');
    expect(em && findSourceRangeOf(em)).toEqual(range(2));
    expect(b && findSourceRangeOf(b)).toEqual(range(1));
    expect(findSourceRangeOf(document.body)).toBeUndefined();
  });

  it('finds nothing outside of rendering', () => {
    expect(findSourceRange()).toBeUndefined();
  });

  it('follows new ranges, and keeps them when the state changes', () => {
    let update: (value: number) => unknown = () => undefined;
    function Stateful(): JSX.Element {
      const [value, setValue] = useState(0);
      update = setValue;
      return <Inner name={`state ${String(value)}`} />;
    }
    const { rerender } = render(at(<Stateful />, 1));
    expect(found.get('state 0')).toEqual(range(1));
    act(() => {
      update(1);
    });
    expect(found.get('state 1')).toEqual(range(1));
    found.clear();
    rerender(at(<Stateful />, 7));
    expect(found.get('state 1')).toEqual(range(7));
  });

  describe('with cloned elements', () => {
    function Clones({
      keep,
      children,
    }: {
      keep: boolean;
      children: ReactElement<{ title?: string }>;
    }): ReactNode {
      // eslint-disable-next-line @eslint-react/no-children-map
      return Children.map(children, (child) => {
        // eslint-disable-next-line @eslint-react/no-clone-element
        const cloned = cloneElement(child as ReactElement<{ title?: string }>, {
          title: 'a',
        });
        return keep ? withSourceOf(cloned, child) : cloned;
      });
    }

    it('loses the range, finding what is around it', () => {
      render(
        at(
          <div>
            <Clones keep={false}>{at(<DropsProps name="a" />, 2)}</Clones>
          </div>,
          1,
        ),
      );
      expect(found.get('a')).toEqual(range(1));
    });

    it('keeps the range with withSourceOf', () => {
      render(<Clones keep>{at(<DropsProps name="a" />, 2)}</Clones>);
      expect(found.get('a')).toEqual(range(2));
    });
  });

  it('keeps the range through Children.toArray', () => {
    // eslint-disable-next-line @eslint-react/no-children-to-array
    const [element] = Children.toArray(at(<p />, 3)) as ReactElement<object>[];
    expect(element && getSourceRange(element.props)).toEqual(range(3));
  });
});
