import { useState, type JSX, type KeyboardEvent } from 'react';

import styles from './SlidePreview.module.css';

const points = [
  'Start with the question',
  'Show the evidence',
  'Make the connection',
];

/** Demonstrates steps and slides without loading the presentation runtime. */
export default function SlidePreview({
  imageSrc,
}: {
  imageSrc: string;
}): JSX.Element {
  const [frame, setFrame] = useState(1);
  const imageSlide = frame === points.length;
  const previous = () => {
    setFrame((value) => Math.max(0, value - 1));
  };
  const next = () => {
    setFrame((value) => Math.min(points.length, value + 1));
  };
  const advance = () => {
    setFrame((value) => (value === points.length ? 0 : value + 1));
  };
  const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault();
      if (event.key === 'ArrowLeft') previous();
      else next();
    }
  };

  return (
    <section
      className={styles['preview']}
      aria-label="Interactive presentation preview"
      onKeyDown={handleKeyDown}
    >
      <div
        className={styles['stage']}
        role="group"
        aria-label="Example slides"
        onClick={advance}
      >
        <div
          className={styles['slide']}
          data-current={!imageSlide}
          aria-hidden={imageSlide}
          inert={imageSlide}
        >
          <h2>One idea at a time</h2>
          <ul>
            {points.map((point, index) => (
              <li
                key={point}
                className={styles['bullet']}
                data-upcoming={index > frame}
              >
                {point}
              </li>
            ))}
          </ul>
        </div>
        <div
          className={styles['slide']}
          data-current={imageSlide}
          aria-hidden={!imageSlide}
          inert={!imageSlide}
        >
          <h2>The next slide</h2>
          <figure className={styles['imageFigure']}>
            <img
              className={styles['photo']}
              src={imageSrc}
              width={900}
              height={600}
              alt="Person giving a talk"
              decoding="async"
              fetchPriority="low"
              draggable={false}
            />
            <figcaption>Show your figures</figcaption>
          </figure>
        </div>
      </div>
      <div className={styles['controls']}>
        <button
          className={styles['control']}
          type="button"
          aria-label="Previous step"
          disabled={frame === 0}
          onClick={previous}
        >
          <span aria-hidden="true">←</span> Previous
        </button>
        <span className={styles['indicator']} role="status" aria-atomic="true">
          {!imageSlide && (
            <>
              Step {frame + 1} of {points.length}
              {' · '}
            </>
          )}
          Slide {imageSlide ? 2 : 1} of 2
        </span>
        <button
          className={styles['control']}
          type="button"
          aria-label="Next step"
          disabled={imageSlide}
          onClick={next}
        >
          Next <span aria-hidden="true">→</span>
        </button>
      </div>
    </section>
  );
}
