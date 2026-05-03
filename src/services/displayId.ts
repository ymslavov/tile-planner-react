import type { Piece } from '../store/types';
import { getChildPieces } from './pieceHelpers';

/**
 * Visual identifier for a piece in the cut sheet, wall preview, niche
 * page, and legends.
 *
 * Defaults to `piece.id`. Only differs when the piece is the root of its
 * tile chain (has no parent) AND it's been *placed* somewhere AND at
 * least one of its descendants is also placed. In that case the root
 * represents a real cut from the same source tile (the implicit
 * complement of the explicitly named children), so we give it the
 * sibling-style suffix "-A": the placement is now "5-A" alongside "5-B",
 * "5-C", etc., disambiguating "the leftover strip from tile 5" from
 * "the whole tile 5".
 *
 * `placed` accepts either a Set<pieceId> or a Map<pieceId, ...> so
 * callers can pass whatever they already have.
 */
export function getDisplayPieceId(
  piece: Piece,
  pieces: Record<string, Piece>,
  placed: Set<string> | Map<string, unknown>
): string {
  if (piece.parentId !== null) return piece.id;
  const has = (id: string) =>
    placed instanceof Set ? placed.has(id) : placed.has(id);
  if (!has(piece.id)) return piece.id;
  const hasPlacedDesc = (id: string): boolean => {
    for (const c of getChildPieces(pieces, id)) {
      if (has(c.id) || hasPlacedDesc(c.id)) return true;
    }
    return false;
  };
  return hasPlacedDesc(piece.id) ? `${piece.id}-A` : piece.id;
}
