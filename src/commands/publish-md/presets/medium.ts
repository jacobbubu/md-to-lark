const RELATIVE_MEDIUM_AUTHOR_LINK_RE = /\]\((\/?@[^)\s]+)\)/g;

export function rewriteRelativeMediumAuthorLinks(markdown: string): string {
  return markdown.replace(RELATIVE_MEDIUM_AUTHOR_LINK_RE, (_matched, rawPath: string) => {
    const normalizedPath = rawPath.startsWith('/') ? rawPath : `/${rawPath}`;
    return `](https://medium.com${normalizedPath})`;
  });
}
