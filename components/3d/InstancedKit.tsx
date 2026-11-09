"use client";

import { useEffect, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import { InstancedMesh, Matrix4, Mesh, MeshStandardMaterial, Object3D, Quaternion, Vector3, type BufferGeometry, type Material } from "three";

// Un modèle Kenney à de nombreux exemplaires : chaque maillage du GLB devient un InstancedMesh, soit un appel de
// rendu par pièce quel que soit le nombre d'exemplaires. Les matériaux sont clonés : la lueur d'un ensemble
// n'atteint pas les autres, ni le cache de drei.

export type Pose = { x: number; y: number; z: number; rot: number; scale: number };

type Part = { geometry: BufferGeometry; material: Material; local: Matrix4 };

function extractParts(root: Object3D): Part[] {
  root.updateMatrixWorld(true);
  const parts: Part[] = [];
  root.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    const material = Array.isArray(object.material) ? object.material[0] : object.material;
    parts.push({ geometry: object.geometry, material: material.clone(), local: object.matrixWorld.clone() });
  });
  return parts;
}

// Matrices de travail réutilisées : aucune allocation dans la boucle d'images.
const workingQuaternion = new Quaternion();
const workingPosition = new Vector3();
const workingScale = new Vector3();
const yAxis = new Vector3(0, 1, 0);

// Matrice d'une pose : position, cap autour de l'axe vertical, échelle uniforme.
export function poseMatrix(pose: Pose, target: Matrix4): Matrix4 {
  workingQuaternion.setFromAxisAngle(yAxis, pose.rot);
  workingPosition.set(pose.x, pose.y, pose.z);
  workingScale.setScalar(pose.scale);
  return target.compose(workingPosition, workingQuaternion, workingScale);
}

const productMatrix = new Matrix4();
const baseMatrix = new Matrix4();

function buildMeshes(parts: Part[], count: number): InstancedMesh[] {
  return parts.map((part) => {
    const mesh = new InstancedMesh(part.geometry, part.material, count);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    return mesh;
  });
}

// Ensemble statique : les matrices sont calculées une fois. `matrices` doit être stable (constante de module).
export function StaticKit({ url, matrices, night = false }: { url: string; matrices: Matrix4[]; night?: boolean }) {
  const { scene } = useGLTF(url);
  const meshes = useMemo(() => {
    const parts = extractParts(scene);
    const meshes = buildMeshes(parts, matrices.length);
    meshes.forEach((mesh, partIndex) => {
      matrices.forEach((matrix, index) => mesh.setMatrixAt(index, productMatrix.copy(matrix).multiply(parts[partIndex].local)));
      mesh.instanceMatrix.needsUpdate = true;
    });
    return meshes;
  }, [scene, matrices]);

  // La nuit, les façades s'éclairent : une lueur ambre sur chaque ensemble, sans toucher aux autres.
  useEffect(() => {
    for (const mesh of meshes) {
      const material = mesh.material;
      if (material instanceof MeshStandardMaterial) {
        material.emissive.set("#fbbf24");
        material.emissiveIntensity = night ? 0.12 : 0;
      }
    }
  }, [meshes, night]);

  return (
    <>
      {meshes.map((mesh, index) => (
        <primitive key={index} object={mesh} />
      ))}
    </>
  );
}

// Ensemble animé : `poses` est mis à jour par le contrôleur de simulation ; les matrices suivent à chaque image.
export function MovingKit({ url, poses }: { url: string; poses: Pose[] }) {
  const { scene } = useGLTF(url);
  const { parts, meshes } = useMemo(() => {
    const parts = extractParts(scene);
    return { parts, meshes: buildMeshes(parts, poses.length) };
  }, [scene, poses.length]);

  useFrame(() => {
    for (let index = 0; index < poses.length; index++) {
      poseMatrix(poses[index], baseMatrix);
      meshes.forEach((mesh, partIndex) => mesh.setMatrixAt(index, productMatrix.copy(baseMatrix).multiply(parts[partIndex].local)));
    }
    for (const mesh of meshes) mesh.instanceMatrix.needsUpdate = true;
  });

  return (
    <>
      {meshes.map((mesh, index) => (
        <primitive key={index} object={mesh} />
      ))}
    </>
  );
}
