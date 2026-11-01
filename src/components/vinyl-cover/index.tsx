// ** React/Next.js Imports
import React, { Suspense, useEffect, useMemo, useRef } from "react";

// ** Third-Party Imports
import { useTexture } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

interface Props {
  coverArt: string | null;
}

/**
 * The album as a real 3D object: a thin record sleeve with the cover art on
 * the front, gently floating and turning.
 *
 * (Replaces an HTML overlay pinned into the scene with drei's <Html>, which
 * threw `removeChild` errors on unmount under React 19.)
 */
const SLEEVE = 2.6; // world units
const DEPTH = 0.04;

const Float: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const ref = useRef<THREE.Group>(null);
  useFrame((state) => {
    if (!ref.current) return;
    const t = state.clock.getElapsedTime();
    ref.current.rotation.x = Math.cos(t / 10) / 10;
    ref.current.rotation.y = Math.sin(t / 10) / 4;
    ref.current.rotation.z = Math.sin(t / 10) / 10;
    ref.current.position.y = Math.sin(t) / 6;
  });
  return <group ref={ref}>{children}</group>;
};

const Sleeve: React.FC<{ url: string }> = ({ url }) => {
  const texture = useTexture(url, (t) => {
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
  });
  // BoxGeometry material order: +x, -x, +y, -y, +z (front), -z (back)
  const materials = useMemo(() => {
    const edge = new THREE.MeshStandardMaterial({ color: "#1a1a1a" });
    const front = new THREE.MeshBasicMaterial({ map: texture });
    const back = new THREE.MeshStandardMaterial({ color: "#e8e4dc" });
    return [edge, edge, edge, edge, front, back];
  }, [texture]);
  useEffect(
    () => () => new Set(materials).forEach((m) => m.dispose()),
    [materials]
  );
  return (
    <mesh material={materials}>
      <boxGeometry args={[SLEEVE, SLEEVE, DEPTH]} />
    </mesh>
  );
};

/** Neutral sleeve shown while the texture loads, or if there's no art. */
const Placeholder = () => (
  <mesh>
    <boxGeometry args={[SLEEVE, SLEEVE, DEPTH]} />
    <meshStandardMaterial color='#d6d3cd' />
  </mesh>
);

const Vinyl3D: React.FC<Props> = ({ coverArt }) => (
  <>
    <ambientLight intensity={0.9} />
    <Float>
      {coverArt ? (
        <Suspense fallback={<Placeholder />}>
          <Sleeve url={coverArt} />
        </Suspense>
      ) : (
        <Placeholder />
      )}
    </Float>
  </>
);

export default Vinyl3D;
