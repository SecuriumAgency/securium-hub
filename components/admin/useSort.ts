import { useMemo, useState } from "react";

// Tri d'un tableau au clic sur un en-tête : une colonne, un sens. Les nombres se comparent en valeur, le texte
// en français (accents, et « 2 » avant « 10 »). Les accesseurs doivent être des constantes de module, pour que le
// tri ne se recalcule qu'aux changements de lignes ou de colonne.

export type SortDirection = "asc" | "desc";
export type SortState<K extends string> = { key: K; direction: SortDirection };
export type Accessors<T, K extends string> = Record<K, (row: T) => number | string>;

export function useSort<T, K extends string>(rows: T[], accessors: Accessors<T, K>, initial: SortState<K>) {
  const [sort, setSort] = useState<SortState<K>>(initial);

  const sorted = useMemo(() => {
    const read = accessors[sort.key];
    const factor = sort.direction === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      const left = read(a);
      const right = read(b);
      const order =
        typeof left === "number" && typeof right === "number"
          ? left - right
          : String(left).localeCompare(String(right), "fr", { sensitivity: "base", numeric: true });
      return factor * order;
    });
  }, [rows, sort, accessors]);

  // Une colonne nouvelle part dans son sens par défaut (dates et scores : le plus élevé d'abord) ; la même colonne inverse.
  const sortBy = (key: K, defaultDirection: SortDirection = "asc") =>
    setSort((current) =>
      current.key === key ? { key, direction: current.direction === "asc" ? "desc" : "asc" } : { key, direction: defaultDirection },
    );

  const invert = () => setSort((current) => ({ ...current, direction: current.direction === "asc" ? "desc" : "asc" }));

  return { sorted, sort, sortBy, invert };
}
