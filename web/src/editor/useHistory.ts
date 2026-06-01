/**
 * Undo/redo over whole-model snapshots. Cheap because the edit helpers return
 * new immutable models (model/edit.ts) — we just keep past/present/future stacks.
 */
import { useCallback, useState } from "react";

interface HistoryState<T> {
  past: T[];
  present: T;
  future: T[];
}

const CAP = 100; // snapshot cap to bound memory

export function useHistory<T>(initial: T) {
  const [state, setState] = useState<HistoryState<T>>({ past: [], present: initial, future: [] });

  /** Commit a new present, pushing the old one onto the undo stack. */
  const set = useCallback((next: T | ((cur: T) => T)) => {
    setState((s) => {
      const value = typeof next === "function" ? (next as (cur: T) => T)(s.present) : next;
      if (value === s.present) return s;
      const past = [...s.past, s.present].slice(-CAP);
      return { past, present: value, future: [] };
    });
  }, []);

  const undo = useCallback(() => {
    setState((s) => {
      if (s.past.length === 0) return s;
      const previous = s.past[s.past.length - 1];
      return { past: s.past.slice(0, -1), present: previous, future: [s.present, ...s.future] };
    });
  }, []);

  const redo = useCallback(() => {
    setState((s) => {
      if (s.future.length === 0) return s;
      const next = s.future[0];
      return { past: [...s.past, s.present], present: next, future: s.future.slice(1) };
    });
  }, []);

  return {
    model: state.present,
    set,
    undo,
    redo,
    canUndo: state.past.length > 0,
    canRedo: state.future.length > 0,
  };
}
