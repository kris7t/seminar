import * as React from 'react';
import type {} from 'mdx/types.js';

// MDX's framework-neutral component types need the React 19 JSX namespace.
declare module 'mdx/types.js' {
  export import JSX = React.JSX;
}
