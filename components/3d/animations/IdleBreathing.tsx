"use client";

import type { ReactNode } from "react";
import { useRef } from "react";
import type { Group } from "three";
import { useIdleBreathing, type BreathingOptions } from "./useIdleBreathing";

// Enveloppe un modèle gltfjsx (qui n'accepte pas de ref) dans un groupe animé. Le modèle reste intact.
export function IdleBreathing({ children, ...options }: BreathingOptions & { children: ReactNode }) {
  const ref = useRef<Group>(null);
  useIdleBreathing(ref, options);
  return <group ref={ref}>{children}</group>;
}
