import type { Extension } from '@codemirror/state';
import { MarkdownEditor } from './markdown-editor';
import type { WikiLinksHostConfig, RelationshipDirectivesHostConfig } from './markdown-editor';
import type { ImageDecorationsOptions } from './extensions/image-decorations';

export interface MarkdownPreviewProps {
  content: string;
  /** Image decoration options — supply resolveSrc to handle relative or non-notes-asset URLs. */
  images?: ImageDecorationsOptions;
  /** Optional wiki-link config — allows link-click navigation from preview surfaces. */
  wikiLinks?: WikiLinksHostConfig;
  className?: string;
  /** Sets data-base-dir on the wrapper div so the peek stack can resolve plain <a href> links. */
  baseDir?: string;
  /** Renders relationship directives read-only (no cross, no choices). */
  relationshipDirectives?: RelationshipDirectivesHostConfig;
  /** Host-supplied extensions active in the preview; memoize to avoid reconfiguring. */
  liveExtensions?: Extension;
}

export const MarkdownPreview: React.FC<MarkdownPreviewProps> = ({
  content,
  images,
  wikiLinks,
  className,
  baseDir,
  relationshipDirectives,
  liveExtensions,
}) => (
  <div className={className} data-base-dir={baseDir}>
    <MarkdownEditor
      content={content}
      readOnly
      images={images}
      wikiLinks={wikiLinks ? { ...wikiLinks, readOnly: true } : wikiLinks}
      relationshipDirectives={relationshipDirectives}
      liveExtensions={liveExtensions}
    />
  </div>
);
