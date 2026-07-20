import { useEffect, useState } from "react";

// Drag-and-drop reordering for a list of {id: string} items. Keeps a local
// id order that's live-updated while dragging (so the list visibly reshuffles
// as you drag over other rows), then reports the final order via onReorder
// once the drag ends. Re-syncs with `items` whenever it changes (add/remove/
// refresh), preserving the current order for ids that still exist.
export default function useReorderableList(items, onReorder) {
  const [order, setOrder] = useState(() => items.map((i) => i.id));
  const [draggingId, setDraggingId] = useState(null);

  useEffect(() => {
    const ids = items.map((i) => i.id);
    setOrder((prev) => {
      const kept = prev.filter((id) => ids.includes(id));
      const added = ids.filter((id) => !kept.includes(id));
      const next = [...kept, ...added];
      if (next.length === prev.length && next.every((id, i) => id === prev[i])) return prev;
      return next;
    });
  }, [items]);

  const byId = new Map(items.map((i) => [i.id, i]));
  const orderedItems = order.map((id) => byId.get(id)).filter(Boolean);

  function handleDragStart(id) {
    setDraggingId(id);
  }

  function handleDragOver(id, e) {
    e.preventDefault();
    if (!draggingId || draggingId === id) return;
    setOrder((prev) => {
      if (prev.indexOf(draggingId) === prev.indexOf(id)) return prev;
      const next = prev.filter((x) => x !== draggingId);
      next.splice(next.indexOf(id), 0, draggingId);
      return next;
    });
  }

  function handleDragEnd() {
    if (draggingId) onReorder(order);
    setDraggingId(null);
  }

  return { orderedItems, draggingId, handleDragStart, handleDragOver, handleDragEnd };
}
