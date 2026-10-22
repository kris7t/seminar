import type { Config } from '@docusaurus/types';
import type { Options, ThemeConfig } from '@docusaurus/preset-classic';

const config: Config = {
  title: 'Seminar',
  tagline: 'Scientific talks and lectures as Markdown presentations',
  url: 'https://seminar.run',
  baseUrl: '/',
  headTags: [
    {
      tagName: 'link',
      attributes: {
        rel: 'icon',
        href: '/favicon.ico',
        type: 'image/x-icon',
        sizes: '16x16 32x32 48x48',
      },
    },
    {
      tagName: 'link',
      attributes: {
        rel: 'icon',
        href: '/favicon.svg',
        type: 'image/svg+xml',
        sizes: 'any',
      },
    },
    {
      tagName: 'link',
      attributes: {
        rel: 'mask-icon',
        href: '/safari-pinned-tab.svg',
        color: '#00639b',
      },
    },
  ],
  onBrokenLinks: 'throw',
  onBrokenAnchors: 'throw',
  markdown: {
    format: 'detect',
    hooks: { onBrokenMarkdownLinks: 'throw' },
    // The escaping of heading IDs also applies inside code blocks, where it
    // adds a backslash to deck headings like `## Title {#id}`.
    mdx1Compat: { headingIds: false },
  },
  presets: [
    [
      'classic',
      {
        docs: {
          routeBasePath: '/',
          sidebarPath: './sidebars.ts',
          editUrl: 'https://github.com/kris7t/seminar/edit/main/packages/docs/',
        },
        blog: false,
        theme: { customCss: './src/css/custom.css' },
      } satisfies Options,
    ],
  ],
  themeConfig: {
    colorMode: { respectPrefersColorScheme: true },
    navbar: {
      title: 'Seminar',
      items: [
        {
          type: 'docSidebar',
          sidebarId: 'userGuide',
          label: 'User guide',
          position: 'left',
        },
        {
          type: 'docSidebar',
          sidebarId: 'developerGuide',
          label: 'Developers',
          position: 'left',
        },
        {
          href: 'https://github.com/kris7t/seminar',
          label: 'GitHub',
          position: 'right',
        },
      ],
    },
    prism: {
      additionalLanguages: ['bash', 'json', 'tsx'],
    },
  } satisfies ThemeConfig,
};

export default config;
