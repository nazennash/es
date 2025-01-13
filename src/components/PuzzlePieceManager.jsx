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
    const distance = this.mesh.position.distanceTo(this.originalPosition);
    return distance < 0.5;
  }

  snapToPosition() {
    this.mesh.position.copy(this.originalPosition);
    this.isPlaced = true;
  }
}

const PuzzlePieceManager = ({ imageUrl, difficulty = 3, onPiecePlace, onComplete }) => {
  const containerRef = useRef(null);
  const piecesRef = useRef([]);
  const controlsRef = useRef(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!imageUrl) {
      setError('Image URL is required');
      return;
    }

    let scene, camera, renderer, orbitControls;

    const initScene = () => {
      scene = new THREE.Scene();
      scene.background = new THREE.Color(0xf0f0f0);
      
      const container = containerRef.current;
      const width = container.clientWidth;
      const height = container.clientHeight;

      camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000);
      renderer = new THREE.WebGLRenderer({ antialias: true });
      renderer.setSize(width, height);
      container.appendChild(renderer.domElement);

      camera.position.z = 5;

      // Add lights
      const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
      scene.add(ambientLight);

      const directionalLight = new THREE.DirectionalLight(0xffffff, 0.5);
      directionalLight.position.set(5, 5, 5);
      scene.add(directionalLight);

      // Add orbit controls
      orbitControls = new OrbitControls(camera, renderer.domElement);
      orbitControls.enableDamping = true;
      orbitControls.dampingFactor = 0.05;
    };

    const createPuzzlePieces = async () => {
      try {
        const texture = await new THREE.TextureLoader().loadAsync(imageUrl);
        const aspectRatio = texture.image.width / texture.image.height;

        const pieceWidth = 1 / difficulty;
        const pieceHeight = (1 / difficulty) * aspectRatio;

        for (let i = 0; i < difficulty; i++) {
          for (let j = 0; j < difficulty; j++) {
            const geometry = new THREE.PlaneGeometry(pieceWidth, pieceHeight, 10, 10);
            const material = new THREE.MeshPhongMaterial({
              map: texture,
              bumpMap: texture,
              bumpScale: 0.1,
            });

            // Set UV mapping for each piece
            const uvs = geometry.attributes.uv;
            const positions = uvs.array;
            for (let k = 0; k < positions.length; k += 2) {
              positions[k] = (positions[k] + i) / difficulty;
              positions[k + 1] = (positions[k + 1] + j) / difficulty;
            }

            const originalPosition = new THREE.Vector3(
              (i - difficulty / 2) * pieceWidth,
              (j - difficulty / 2) * pieceHeight,
              0
            );

            const randomPosition = new THREE.Vector3(
              Math.random() * 2 - 1,
              Math.random() * 2 - 1,
              0
            );

            const piece = new PuzzlePiece(geometry, material, randomPosition, originalPosition);
            piecesRef.current.push(piece);
            scene.add(piece.mesh);
          }
        }
        setIsLoading(false);
      } catch (err) {
        setError(`Error creating puzzle pieces: ${err.message}`);
        setIsLoading(false);
      }
    };

    const setupDragControls = () => {
      const pieces = piecesRef.current.map(piece => piece.mesh);
      controlsRef.current = new DragControls(pieces, camera, renderer.domElement);

      controlsRef.current.addEventListener('dragstart', () => {
        orbitControls.enabled = false;
      });

      controlsRef.current.addEventListener('dragend', (event) => {
        orbitControls.enabled = true;
        const piece = piecesRef.current.find(p => p.mesh === event.object);

        if (piece && piece.isNearOriginalPosition()) {
          piece.snapToPosition();
          onPiecePlace();

          // Check if puzzle is complete
          const isComplete = piecesRef.current.every(p => p.isPlaced);
          if (isComplete && onComplete) {
            onComplete();
          }
        }
      });
    };

    const animate = () => {
      if (!renderer) return;
      requestAnimationFrame(animate);
      orbitControls?.update();
      renderer.render(scene, camera);
    };

    const handleResize = () => {
      if (camera && renderer && containerRef.current) {
        const container = containerRef.current;
        const width = container.clientWidth;
        const height = container.clientHeight;

        camera.aspect = width / height;
        camera.updateProjectionMatrix();
        renderer.setSize(width, height);
      }
    };

    try {
      initScene();
      createPuzzlePieces();
      setupDragControls();
      animate();

      window.addEventListener('resize', handleResize);

      return () => {
        window.removeEventListener('resize', handleResize);
        if (containerRef.current && renderer.domElement) {
          containerRef.current.removeChild(renderer.domElement);
        }
        piecesRef.current.forEach(piece => {
          piece.mesh.geometry.dispose();
          piece.mesh.material.dispose();
        });
        renderer.dispose();
      };
    } catch (err) {
      setError(`Error initializing scene: ${err.message}`);
    }
  }, [imageUrl, difficulty, onPiecePlace, onComplete]);

  if (error) {
    return (
      <div className="error-container p-4 bg-red-50 border border-red-200 rounded-lg">
        <p className="text-red-600">{error}</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="loading-container flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  return (
    <div 
      ref={containerRef} 
      className="puzzle-piece-manager w-full h-full min-h-[500px]"
    />
  );
};

export default PuzzlePieceManager;