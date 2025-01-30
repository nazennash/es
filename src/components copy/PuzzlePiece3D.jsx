import React, { useRef } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';

export function PuzzlePiece3D({ piece, gameState, onPieceMove, onPieceSelect }) {
  const meshRef = useRef();
  const { size } = useThree();

  // Calculate texture coordinates the same way as 2D
  const pieceSize = 100 / gameState.difficulty;
  const textureLoader = new THREE.TextureLoader();
  const texture = textureLoader.load(gameState.imageUrl);
  
  // Match 2D background sizing
  texture.repeat.set(1/gameState.difficulty, 1/gameState.difficulty);
  texture.offset.set(
    piece.correct.y * (1/gameState.difficulty),
    1 - (piece.correct.x * (1/gameState.difficulty)) - (1/gameState.difficulty)
  );

  return (
    <mesh
      ref={meshRef}
      position={[
        piece.current.x - (gameState.difficulty / 2),
        0.05,
        piece.current.y - (gameState.difficulty / 2)
      ]}
      rotation={[0, (piece.rotation * Math.PI) / 180, 0]}
      onClick={() => onPieceSelect(piece)}
    >
      <boxGeometry args={[0.9, 0.1, 0.9]} />
      <meshStandardMaterial
        map={texture}
        roughness={0.3}
        metalness={0.1}
        side={THREE.DoubleSide}
        color={piece.isPlaced ? '#4ade80' : 'white'}
      />
    </mesh>
  );
}
