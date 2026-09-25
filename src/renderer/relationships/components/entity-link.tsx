import { openFromWikiLink, closeFromWikiLink } from '../../peek/stack';

export interface EntityLinkProps {
  id: string;
  label: string;
  onOpenById: (id: string) => void;
  className?: string;
}

/** A holder/observer link: hover peeks the note, Ctrl/Cmd+click opens it. Plain click does nothing (read-only view). */
export function EntityLink({ id, label, onOpenById, className }: EntityLinkProps) {
  return (
    <span
      className={`rel-entity-link${className ? ` ${className}` : ''}`}
      onMouseEnter={(e) => openFromWikiLink(id, e.currentTarget)}
      onMouseLeave={(e) => closeFromWikiLink(e.relatedTarget as Element | null)}
      onClick={(e) => {
        if (e.ctrlKey || e.metaKey) {
          e.preventDefault();
          onOpenById(id);
        }
      }}
    >
      {label}
    </span>
  );
}
