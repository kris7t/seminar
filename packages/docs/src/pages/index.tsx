import Link from '@docusaurus/Link';
import useBaseUrl from '@docusaurus/useBaseUrl';
import CodeBlock from '@theme/CodeBlock';
import Layout from '@theme/Layout';
import { useState, type JSX } from 'react';

import SlidePreview from '../components/SlidePreview.tsx';
import styles from './index.module.css';

const example = `### One idea at a time

- Start with the question
- :step Show the evidence
- :step Make the connection

### The next slide

![Person giving a talk](./talk.webp "Show your figures")`;

/** Introduces Seminar and the guides for presenters and developers. */
export default function Home(): JSX.Element {
  const talkImage = useBaseUrl('/img/talk.webp');
  const [frame, setFrame] = useState(0);
  const highlightedLine = frame < 3 ? frame + 3 : 9;
  return (
    <Layout
      title="Scientific talks, written in Markdown"
      description="Write interactive presentations in Markdown and React. Present with notes, reveal ideas step by step, and share a single HTML file that works offline."
    >
      <main>
        <header className={styles['hero']}>
          <div className={['container', styles['heroGrid']].join(' ')}>
            <div>
              <p className={styles['eyebrow']}>Markdown. React. Present.</p>
              <h1>
                Scientific talks,
                <br />
                written in Markdown.
              </h1>
              <p className={styles['intro']}>
                Build talks and lectures from plain text, math, and interactive
                React components. Reveal ideas step by step, then share a single
                HTML file that works offline.
              </p>
              <div className={styles['quickStart']}>
                <CodeBlock language="bash" title="Create a presentation">
                  npm create seminar@latest my-talk
                </CodeBlock>
                <p>Requires Node.js 22 or newer.</p>
              </div>
              <div className={styles['actions']}>
                <Link
                  className="button button--primary button--lg"
                  to="/guide/getting-started"
                >
                  Get started
                </Link>
                <Link
                  className={[
                    'button button--outline button--secondary button--lg',
                    styles['developerButton'],
                  ].join(' ')}
                  to="/developer/"
                >
                  Developer guide
                </Link>
              </div>
              <p className={styles['status']}>
                Seminar is a proof of concept. APIs and syntax may still change.
              </p>
            </div>
            <figure className={styles['example']}>
              <CodeBlock
                language="markdown"
                metastring={`{${highlightedLine.toString()}}`}
              >
                {example}
              </CodeBlock>
              <SlidePreview
                imageSrc={talkImage}
                frame={frame}
                onFrameChange={setFrame}
              />
            </figure>
          </div>
        </header>
        <section className={['container', styles['features']].join(' ')}>
          <article>
            <span className={styles['featureNumber']} aria-hidden="true">
              01
            </span>
            <h2>Keep your ideas in plain text</h2>
            <p>
              Write slides in MDX, keep them under version control, and typeset
              math and code with MathJax and Shiki.
            </p>
            <Link to="/guide/core/content">Explore the slide syntax →</Link>
          </article>
          <article>
            <span className={styles['featureNumber']} aria-hidden="true">
              02
            </span>
            <h2>Focus on the explanation</h2>
            <p>
              Reveal content one step at a time. Group related points, nest
              steps, and control how content appears before and after its turn.
            </p>
            <Link to="/guide/core/steps">Learn how steps work →</Link>
          </article>
          <article>
            <span className={styles['featureNumber']} aria-hidden="true">
              03
            </span>
            <h2>Present from your browser</h2>
            <p>
              Keep notes, slide previews, and a timer in the presenter view.
              Navigate by keyboard or touch, jump through the overview, and show
              a laser pointer.
            </p>
            <Link to="/guide/presenting">Explore presentation controls →</Link>
          </article>
          <article>
            <span className={styles['featureNumber']} aria-hidden="true">
              04
            </span>
            <h2>Preview as you write</h2>
            <p>
              Edit MDX in your usual editor or with a coding agent. Vite updates
              the deck as you save, keeping your current slide and shared state.
            </p>
            <Link to="/guide/editing">Edit and preview your deck →</Link>
          </article>
          <article>
            <span className={styles['featureNumber']} aria-hidden="true">
              05
            </span>
            <h2>Create your first deck</h2>
            <p>
              Create a project, choose presentation features and a theme, then
              build a single HTML file to present or share.
            </p>
            <Link to="/guide/getting-started">Get started →</Link>
          </article>
          <article>
            <span className={styles['featureNumber']} aria-hidden="true">
              06
            </span>
            <h2>Make your slides interactive</h2>
            <p>
              Bring React components into your deck, share state across views,
              and build your own plugins and themes.
            </p>
            <Link to="/developer/">Build with Seminar →</Link>
          </article>
        </section>
      </main>
    </Layout>
  );
}
