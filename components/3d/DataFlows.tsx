"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Color, Object3D, QuadraticBezierCurve3, Vector3, type InstancedMesh } from "three";
import { nodePosition } from "@/lib/matrix/tools";
import { useMatrixStore, type MatrixState } from "@/store/useMatrixStore";

// Flux de particules entre les bâtiments. Une seule InstancedMesh pour toute la scène : chaque flux réserve
// PER_FLOW emplacements, et le nombre d'emplacements visibles suit l'activité réelle (store).
const PER_FLOW = 5;
const ARC_HEIGHT = 0.9;

type FlowKind = "outreach" | "lead" | "broker" | "repair";
type FlowDef = { kind: FlowKind; from: string; to: string; siteId?: string; color: string };

const FLOWS: FlowDef[] = [
  // Prospection, OSINT et Lead Broker alimentent le Matchmaker : le flux « outreach ».
  { kind: "outreach", from: "prospection", to: "matchmaker", color: "#22d3ee" },
  { kind: "outreach", from: "osint", to: "matchmaker", color: "#22d3ee" },
  { kind: "outreach", from: "lead-broker", to: "matchmaker", color: "#22d3ee" },
  // Le Matchmaker assigne les leads aux sites artisans.
  { kind: "lead", from: "matchmaker", to: "geoenergy-habitat", siteId: "geoenergy-habitat", color: "#34d399" },
  { kind: "lead", from: "matchmaker", to: "elite-depannage-34", siteId: "elite-depannage-34", color: "#34d399" },
  { kind: "lead", from: "matchmaker", to: "rescue-247-uk", siteId: "rescue-247-uk", color: "#34d399" },
  // Le Lead Broker vend les leads captés vers le Parc Sites.
  { kind: "broker", from: "lead-broker", to: "parc-sites", color: "#c084fc" },
  // Félix Fix : l'Escadron relaie vers la tour centrale, qui envoie l'essaim vers le site ciblé.
  { kind: "repair", from: "escadron", to: "securium-os", color: "#fbbf24" },
  { kind: "repair", from: "securium-os", to: "geoenergy-habitat", siteId: "geoenergy-habitat", color: "#fb923c" },
  { kind: "repair", from: "securium-os", to: "elite-depannage-34", siteId: "elite-depannage-34", color: "#fb923c" },
];

const SIZE: Record<FlowKind, number> = { outreach: 0.09, lead: 0.1, broker: 0.1, repair: 0.15 };

function arc(from: string, to: string): QuadraticBezierCurve3 {
  const a = nodePosition(from) ?? [0, 0, 0];
  const b = nodePosition(to) ?? [0, 0, 0];
  const start = new Vector3(a[0], ARC_HEIGHT, a[2]);
  const end = new Vector3(b[0], ARC_HEIGHT, b[2]);
  const mid = start.clone().lerp(end, 0.5);
  mid.y += 1.4 + start.distanceTo(end) * 0.12;
  return new QuadraticBezierCurve3(start, mid, end);
}

// Combien d'emplacements d'un flux sont visibles, et à quelle vitesse ils avancent, selon l'état du store.
function activity(flow: FlowDef, state: MatrixState): { active: boolean; count: number; speed: number } {
  const pending = state.pendingTotal;
  if (flow.kind === "outreach") {
    return { active: true, count: Math.min(PER_FLOW, 1 + pending), speed: 0.12 + Math.min(pending, 8) * 0.03 };
  }
  if (flow.kind === "lead") {
    // Leads reçus aujourd'hui par le site destinataire : plus il y en a, plus les particules sont nombreuses et rapides.
    const leads = flow.siteId ? (state.metrics?.leads.todayBySite[flow.siteId] ?? 0) : (state.metrics?.leads.today ?? 0);
    return { active: true, count: Math.min(PER_FLOW, 1 + leads), speed: 0.12 + Math.min(leads, 10) * 0.04 };
  }
  if (flow.kind === "broker") {
    // Leads captés aujourd'hui par le Lead Broker : le flux vers le Parc Sites accélère avec eux.
    const captured = state.metrics?.capturedLeads.today ?? 0;
    return { active: true, count: Math.min(PER_FLOW, 1 + captured), speed: 0.12 + Math.min(captured, 10) * 0.04 };
  }
  const busy = flow.siteId
    ? Boolean(state.sites[flow.siteId]?.repairing)
    : Object.values(state.sites).some((runtime) => runtime.repairing);
  return { active: busy, count: PER_FLOW, speed: 0.5 };
}

export function DataFlows() {
  const meshRef = useRef<InstancedMesh>(null);
  const curves = useMemo(() => FLOWS.map((flow) => arc(flow.from, flow.to)), []);
  const total = FLOWS.length * PER_FLOW;
  const progress = useMemo(() => Array.from({ length: total }, (_, index) => (index % PER_FLOW) / PER_FLOW), [total]);
  const dummy = useMemo(() => new Object3D(), []);

  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const color = new Color();
    FLOWS.forEach((flow, flowIndex) => {
      color.set(flow.color);
      for (let slot = 0; slot < PER_FLOW; slot++) mesh.setColorAt(flowIndex * PER_FLOW + slot, color);
    });
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, []);

  useFrame((_, delta) => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const state = useMatrixStore.getState();
    FLOWS.forEach((flow, flowIndex) => {
      const info = activity(flow, state);
      for (let slot = 0; slot < PER_FLOW; slot++) {
        const index = flowIndex * PER_FLOW + slot;
        progress[index] = (progress[index] + delta * info.speed) % 1;
        if (info.active && slot < info.count) {
          curves[flowIndex].getPoint(progress[index], dummy.position);
          dummy.scale.setScalar(SIZE[flow.kind]);
        } else {
          dummy.position.set(0, -10, 0);
          dummy.scale.setScalar(0);
        }
        dummy.updateMatrix();
        mesh.setMatrixAt(index, dummy.matrix);
      }
    });
    mesh.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, total]} frustumCulled={false}>
      <sphereGeometry args={[1, 10, 8]} />
      <meshBasicMaterial toneMapped={false} />
    </instancedMesh>
  );
}
