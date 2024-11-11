// ** React/Next.js Imports
import React, { useRef, useEffect } from "react";

// ** Third-Party Imports
import { useFrame, useLoader } from "@react-three/fiber";
import * as THREE from "three";
import { Html } from "@react-three/drei";
import { a as three } from "@react-spring/three";

// ** Custom Components, Hooks, Utils, etc.
import Card from "@/components/vinyl-cover/3DCard";

interface Props {
  coverArt: string | null;
}

const Vinyl3D: React.FC<Props> = ({ coverArt }) => {
  const meshRef = useRef<THREE.Mesh>(null);

  useFrame((state) => {
    if (meshRef.current) {
      const t = state.clock.getElapsedTime();

      meshRef.current.rotation.x = Math.cos(t / 10) / 10;
      meshRef.current.rotation.y = Math.sin(t / 10) / 4;
      meshRef.current.rotation.z = Math.sin(t / 10) / 10;
      meshRef.current.position.y = Math.sin(t) / 3;
    }
  });

  return (
    <mesh ref={meshRef} scale={2}>
      <Html occlude distanceFactor={1.5} position={[0, 0, 0.51]} transform>
        <Card
          style={{
            width: "400px",
            height: "400px",
            backgroundColor: "rgba(245, 101, 101, 0)",
            backgroundImage: `url(${coverArt})`,
            backgroundSize: "cover",
            backgroundPosition: "center",
            padding: "1rem",
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            textAlign: "center",
            color: "rgba(245, 101, 101, 0)",
            transition: "background-image 0.4s ease-in-out",
          }}
        />
      </Html>
    </mesh>
  );
};

export default Vinyl3D;
