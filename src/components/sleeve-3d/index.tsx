// ** React/Next.js Imports
import React from "react";

// ** Third-Party Imports
import { OrbitControls } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";

// ** Custom Components, Hooks, Utils, etc.
import Vinyl3D from "@/components/vinyl-cover";

/** The floating 3D sleeve in its own canvas (client-only: WebGL). */
const Sleeve3D: React.FC<{ coverArt: string | null }> = ({ coverArt }) => (
  <Canvas camera={{ position: [0, 0, 2.4], fov: 75 }}>
    <pointLight position={[10, 10, 10]} />
    <Vinyl3D coverArt={coverArt} />
    <OrbitControls makeDefault enableZoom={false} />
  </Canvas>
);

export default Sleeve3D;
