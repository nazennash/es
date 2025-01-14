import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { DragControls } from 'three/examples/jsm/controls/DragControls';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';

export class PuzzlePiece {
  constructor(geometry, material, position, originalPosition) {
    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.position.copy(position);
    this.originalPosition = originalPosition;
    this.isPlaced = false;
  }

  isNearOriginalPosition() {
    return this.mesh.position.distanceTo(this.originalPosition) < 0.5;
  }

  snapToPosition() {
    this.mesh.position.copy(this.originalPosition);
    this.isPlaced = true;
  }

  dispose() {
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
  }
}

const PuzzlePieceManager = ({ imageUrl, difficulty = 3, onPiecePlace, onComplete }) => {
  const containerRef = useRef(null);
  const piecesRef = useRef([]);
  const sceneRef = useRef(null);
  const cameraRef = useRef(null);
  const rendererRef = useRef(null);
  const orbitControlsRef = useRef(null);
  const dragControlsRef = useRef(null);
  const [error, setError] = useState(null);
  const [isInitialized, setIsInitialized] = useState(false);

  useEffect(() => {
    const initScene = () => {
      const container = containerRef.current;
      const width = container.clientWidth || 800;
      const height = container.clientHeight || 600;

      // Initialize scene, camera, and renderer
      sceneRef.current = new THREE.Scene();
      cameraRef.current = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000);
      cameraRef.current.position.set(0, 0, 10);

      rendererRef.current = new THREE.WebGLRenderer({ antialias: true });
      rendererRef.current.setSize(width, height);
      container.appendChild(rendererRef.current.domElement);

      // Add lighting
      sceneRef.current.add(new THREE.AmbientLight(0xffffff, 0.5));
      const directionalLight = new THREE.DirectionalLight(0xffffff, 0.5);
      directionalLight.position.set(5, 5, 5);
      sceneRef.current.add(directionalLight);

      // Add orbit controls
      orbitControlsRef.current = new OrbitControls(cameraRef.current, rendererRef.current.domElement);
      orbitControlsRef.current.enableDamping = true;

      setIsInitialized(true);
    };

    if (containerRef.current && imageUrl && !isInitialized) {
      initScene();
    }

    return () => {
      if (rendererRef.current) rendererRef.current.dispose();
      if (dragControlsRef.current) dragControlsRef.current.dispose();
      piecesRef.current.forEach(piece => piece.dispose());
    };
  }, [imageUrl, isInitialized]);

  useEffect(() => {
    const createPuzzlePieces = () => {
      const loader = new THREE.TextureLoader();
      loader.load(
        imageUrl,
        (texture) => {
          const pieceSize = 1 / difficulty;

          // Clear existing pieces
          piecesRef.current.forEach(piece => {
            piece.dispose();
            sceneRef.current.remove(piece.mesh);
          });
          piecesRef.current = [];

          // Generate puzzle pieces
          for (let i = 0; i < difficulty; i++) {
            for (let j = 0; j < difficulty; j++) {
              const geometry = new THREE.PlaneGeometry(pieceSize, pieceSize);
              const material = new THREE.MeshPhongMaterial({
                map: texture,
                side: THREE.DoubleSide,
              });

              const originalPosition = new THREE.Vector3(
                (i - difficulty / 2) * pieceSize,
                (j - difficulty / 2) * pieceSize,
                0
              );

              const randomPosition = new THREE.Vector3(
                Math.random() * 4 - 2,
                Math.random() * 4 - 2,
                Math.random() * 0.2 - 0.1 // Slight Z-offset for layering
              );

              const piece = new PuzzlePiece(geometry, material, randomPosition, originalPosition);
              piecesRef.current.push(piece);
              sceneRef.current.add(piece.mesh);
            }
          }

          // Add drag controls
          dragControlsRef.current = new DragControls(
            piecesRef.current.map(p => p.mesh),
            cameraRef.current,
            rendererRef.current.domElement
          );

          dragControlsRef.current.addEventListener('dragend', (event) => {
            const piece = piecesRef.current.find(p => p.mesh === event.object);
            if (piece && piece.isNearOriginalPosition()) {
              piece.snapToPosition();
              onPiecePlace?.();
              if (piecesRef.current.every(p => p.isPlaced)) {
                onComplete?.();
              }
            }
          });
        },
        undefined,
        () => setError('Failed to load image.')
      );
    };

    if (isInitialized && sceneRef.current) {
      createPuzzlePieces();
    }
  }, [difficulty, imageUrl, isInitialized]);

  useEffect(() => {
    if (!isInitialized) return;

    const animate = () => {
      rendererRef.current.render(sceneRef.current, cameraRef.current);
      orbitControlsRef.current.update();
      requestAnimationFrame(animate);
    };

    animate();
  }, [isInitialized]);

  if (error) {
    return <div className="text-red-600 font-bold text-center">{error}</div>;
  }

  return <div ref={containerRef} className="w-full h-full min-h-[500px] bg-gray-100" />;
};

export default PuzzlePieceManager;
