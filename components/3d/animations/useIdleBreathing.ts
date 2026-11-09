import type { RefObject } from "react";
import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import type { Group } from "three";

export type BreathingOptions = {
  // Amplitude de la micro-oscillation verticale, en unités de scène.
  amplitude?: number;
  // Vitesse de l'oscillation (rad/s) : 2 rad/s donne un rebond d'environ 3 secondes.
  speed?: number;
  // Rotation d'observation lente, en radians (0 = pas de rotation).
  sway?: number;
  swaySpeed?: number;
  // Décalage de phase, pour que deux figurants ne bougent pas à l'unisson.
  phase?: number;
  // Respiration par la taille, en fraction (0.02 = ±2 %) : pour les animaux.
  pulse?: number;
};

const DEFAULTS: Required<BreathingOptions> = { amplitude: 0.03, speed: 2, sway: 0, swaySpeed: 0.8, phase: 0, pulse: 0 };

/**
 * Micro-oscillation sur l'axe Y (et rotation lente facultative) appliquée à un groupe, à chaque image.
 * Ne modifie que la position, la rotation et l'échelle du groupe : aucune allocation par image.
 */
export function useIdleBreathing(ref: RefObject<Group | null>, options: BreathingOptions = {}) {
  const { amplitude, speed, sway, swaySpeed, phase, pulse } = { ...DEFAULTS, ...options };
  const restY = useRef<number | null>(null);

  useFrame((state) => {
    const group = ref.current;
    if (!group) return;
    if (restY.current === null) restY.current = group.position.y;
    const time = state.clock.elapsedTime + phase;
    group.position.y = restY.current + Math.sin(time * speed) * amplitude;
    if (sway) group.rotation.y = Math.sin(time * swaySpeed) * sway;
    if (pulse) group.scale.setScalar(1 + Math.sin(time * speed) * pulse);
  });
}
