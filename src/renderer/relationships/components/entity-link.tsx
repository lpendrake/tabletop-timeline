import { openFromWikiLink, closeFromWikiLink } from '../../peek/stack';

export interface EntityLinkProps {
  id: string;
  label: string;
  onOpenById: (id: string) => void;
  className?: string;
}

/** A holder/observer link: hover peeks the note, a click opens it (as wiki links do). Never toggles the row it sits in. */
export function EntityLink({ id, label, onOpenById, className }: EntityLinkProps) {
  return (
    <span
      className={`rel-entity-link${className ? ` ${className}` : ''}`}
      onMouseEnter={(e) => openFromWikiLink(id, e.currentTarget)}
      onMouseLeave={(e) => closeFromWikiLink(e.relatedTarget as Element | null)}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onOpenById(id);
      }}
    >
      {label}
    </span>
  );
}
