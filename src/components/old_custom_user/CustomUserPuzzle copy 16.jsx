import React, { useState, useRef, useEffect } from "react";
import { Canvas } from "@react-three/fiber";
import * as THREE from "three";
import { BoxBufferGeometry, MeshStandardMaterial } from 'three';


// Component for the draggable puzzle pieces
function PuzzlePiece({ position, texture, onDrag, children }) {
  const meshRef = useRef();

  useEffect(() => {
    const handleMouseMove = (event) => {
      if (onDrag && meshRef.current) {
        const { clientX, clientY } = event;
        const mouse = new THREE.Vector2();
        mouse.x = (clientX / window.innerWidth) * 2 - 1;
        mouse.y = -(clientY / window.innerHeight) * 2 + 1;
        const raycaster = new THREE.Raycaster();
        raycaster.update();
        raycaster.setFromCamera(mouse, event);
        const intersects = raycaster.intersectObject(meshRef.current);
        if (intersects.length > 0) {
          onDrag(intersects[0].point);
        }
      }
    };

    window.addEventListener("mousemove", handleMouseMove);
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, [onDrag]);

  return (
    <mesh ref={meshRef} position={position}>
      <boxBufferGeometry args={[1, 1, 0.1]} />
      <meshStandardMaterial map={texture} />
      {children}
    </mesh>
  );
}

function App() {
  const [image, setImage] = useState(null);
  const [pieces, setPieces] = useState([]);
  const [draggedPiece, setDraggedPiece] = useState(null);

  const handleImageUpload = (e) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const img = new Image();
      img.src = reader.result;
      img.onload = () => {
        createPuzzle(img);
      };
    };
    reader.readAsDataURL(e.target.files[0]);
  };

  const createPuzzle = (img) => {
    const texture = new THREE.Texture(img);
    texture.needsUpdate = true;

    // Example: Break the image into 4 pieces (you can customize this)
    const newPieces = [];
    for (let i = 0; i < 4; i++) {
      newPieces.push({
        id: i,
        position: [Math.random() * 2 - 1, Math.random() * 2 - 1, 0], // random positions for each piece
        texture,
      });
    }
    setPieces(newPieces);
  };

  const handleDrag = (point) => {
    if (draggedPiece) {
      const newPieces = [...pieces];
      newPieces[draggedPiece.id].position = [point.x, point.y, 0];
      setPieces(newPieces);
    }
  };

  return (
    <div>
      <input type="file" onChange={handleImageUpload} />
      <Canvas style={{ height: "500px", width: "100%" }} camera={{ position: [0, 0, 5] }}>
        <ambientLight intensity={0.5} />
        <directionalLight position={[5, 5, 5]} />
        
        {pieces.map((piece, index) => (
          <PuzzlePiece
            key={piece.id}
            position={piece.position}
            texture={piece.texture}
            onDrag={(point) => setDraggedPiece({ ...piece, id: index })}
          />
        ))}
      </Canvas>
    </div>
  );
}

export default App;
