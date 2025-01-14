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
  const [error, setError] = useState(null);
  const [isInitialized, setIsInitialized] = useState(false);

  useEffect(() => {
    if (!containerRef.current || !imageUrl || isInitialized) return;

    const initScene = () => {
      const container = containerRef.current;
      const width = container.clientWidth || 800;
      const height = container.clientHeight || 600;

      sceneRef.current = new THREE.Scene();
      cameraRef.current = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000);
      cameraRef.current.position.set(0, 0, 10);

      rendererRef.current = new THREE.WebGLRenderer({ antialias: true });
      rendererRef.current.setSize(width, height);
      container.appendChild(rendererRef.current.domElement);

      sceneRef.current.add(new THREE.AmbientLight(0xffffff, 0.5));
      const directionalLight = new THREE.DirectionalLight(0xffffff, 0.5);
      directionalLight.position.set(5, 5, 5);
      sceneRef.current.add(directionalLight);

      orbitControlsRef.current = new OrbitControls(cameraRef.current, rendererRef.current.domElement);
      orbitControlsRef.current.enableDamping = true;

      setIsInitialized(true);
    };

    initScene();

    return () => {
      if (rendererRef.current) rendererRef.current.dispose();
      piecesRef.current.forEach(piece => piece.dispose());
    };
  }, [imageUrl, isInitialized]);

  useEffect(() => {
    if (!isInitialized || !sceneRef.current) return;

    const createPuzzlePieces = () => {
      const loader = new THREE.TextureLoader();
      loader.load(
        imageUrl,
        (texture) => {
          const pieceSize = 1 / difficulty;

          piecesRef.current.forEach(piece => {
            piece.dispose();
            sceneRef.current.remove(piece.mesh);
          });
          piecesRef.current = [];

          for (let i = 0; i < difficulty; i++) {
            for (let j = 0; j < difficulty; j++) {
              const geometry = new THREE.PlaneGeometry(pieceSize, pieceSize);
              const material = new THREE.MeshPhongMaterial({ map: texture });

              const originalPosition = new THREE.Vector3(
                (i - difficulty / 2) * pieceSize,
                (j - difficulty / 2) * pieceSize,
                0
              );

              const randomPosition = new THREE.Vector3(
                Math.random() * 2 - 1,
                Math.random() * 2 - 1,
                0
              );

              const piece = new PuzzlePiece(geometry, material, randomPosition, originalPosition);
              piecesRef.current.push(piece);
              sceneRef.current.add(piece.mesh);
            }
          }

          const dragControls = new DragControls(
            piecesRef.current.map(p => p.mesh),
            cameraRef.current,
            rendererRef.current.domElement
          );

          dragControls.addEventListener('dragend', (event) => {
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

    createPuzzlePieces();
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
    return <div className="text-red-600">{error}</div>;
  }

  return <div ref={containerRef} className="w-full h-full min-h-[500px]" />;
};

export default PuzzlePieceManager;
