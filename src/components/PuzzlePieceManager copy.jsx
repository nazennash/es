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

  dispose() {
    if (this.mesh) {
      this.mesh.geometry.dispose();
      this.mesh.material.dispose();
    }
  }
}

const PuzzlePieceManager = ({ imageUrl, difficulty = 3, onPiecePlace, onComplete }) => {
  const containerRef = useRef(null);
  const piecesRef = useRef([]);
  const sceneRef = useRef(null);
  const cameraRef = useRef(null);
  const rendererRef = useRef(null);
  const controlsRef = useRef(null);
  const orbitControlsRef = useRef(null);
  const animationFrameRef = useRef(null);
  const textureRef = useRef(null);
  
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isInitialized, setIsInitialized] = useState(false);

  // Scene initialization
  useEffect(() => {
    if (!containerRef.current || !imageUrl || isInitialized) return;

    const initScene = () => {
      try {
        const container = containerRef.current;
        if (!container) return;

        // Wait for next frame to ensure container is rendered
        requestAnimationFrame(() => {
          const width = container.clientWidth || 800; // Fallback width
          const height = container.clientHeight || 600; // Fallback height

          sceneRef.current = new THREE.Scene();
          sceneRef.current.background = new THREE.Color(0xf0f0f0);

          cameraRef.current = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000);
          cameraRef.current.position.z = 5;

          rendererRef.current = new THREE.WebGLRenderer({ 
            antialias: true,
            powerPreference: "high-performance"
          });
          rendererRef.current.setSize(width, height);
          rendererRef.current.setPixelRatio(window.devicePixelRatio);
          container.appendChild(rendererRef.current.domElement);

          // Add lights
          const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
          sceneRef.current.add(ambientLight);

          const directionalLight = new THREE.DirectionalLight(0xffffff, 0.5);
          directionalLight.position.set(5, 5, 5);
          sceneRef.current.add(directionalLight);

          // Add orbit controls
          orbitControlsRef.current = new OrbitControls(cameraRef.current, rendererRef.current.domElement);
          orbitControlsRef.current.enableDamping = true;
          orbitControlsRef.current.dampingFactor = 0.05;

          setIsInitialized(true);
        });
      } catch (err) {
        setError(`Failed to initialize scene: ${err.message}`);
      }
    };

    initScene();

    return () => {
      if (rendererRef.current && containerRef.current) {
        containerRef.current.removeChild(rendererRef.current.domElement);
      }
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      // Dispose of Three.js objects
      if (rendererRef.current) {
        rendererRef.current.dispose();
      }
      if (textureRef.current) {
        textureRef.current.dispose();
      }
      piecesRef.current.forEach(piece => piece.dispose());
    };
  }, [imageUrl, isInitialized]);

  // Puzzle pieces creation
  useEffect(() => {
    if (!isInitialized || !sceneRef.current) return;

    const createPuzzlePieces = () => {
      const textureLoader = new THREE.TextureLoader();
      
      textureLoader.load(
        imageUrl,
        (texture) => {
          try {
            textureRef.current = texture;
            const aspectRatio = texture.image.width / texture.image.height;

            const pieceWidth = 1 / difficulty;
            const pieceHeight = (1 / difficulty) * aspectRatio;

            // Clear existing pieces
            piecesRef.current.forEach(piece => {
              if (piece.mesh && sceneRef.current) {
                piece.dispose();
                sceneRef.current.remove(piece.mesh);
              }
            });
            piecesRef.current = [];

            for (let i = 0; i < difficulty; i++) {
              for (let j = 0; j < difficulty; j++) {
                const geometry = new THREE.PlaneGeometry(pieceWidth, pieceHeight);
                const material = new THREE.MeshPhongMaterial({
                  map: texture,
                  // Only use bumpMap if the texture is loaded successfully
                  ...(texture && { bumpMap: texture, bumpScale: 0.1 })
                });

                // Safely update UV mapping
                if (geometry.attributes && geometry.attributes.uv) {
                  const positions = geometry.attributes.uv.array;
                  for (let k = 0; k < positions.length; k += 2) {
                    positions[k] = (positions[k] + i) / difficulty;
                    positions[k + 1] = (positions[k + 1] + j) / difficulty;
                  }
                  geometry.attributes.uv.needsUpdate = true;
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
                if (piece.mesh) {
                  piecesRef.current.push(piece);
                  sceneRef.current.add(piece.mesh);
                }
              }
            }

            setupDragControls();
            setIsLoading(false);
          } catch (err) {
            setError(`Error creating puzzle pieces: ${err.message}`);
            setIsLoading(false);
          }
        },
        undefined,
        (err) => {
          setError(`Error loading texture: ${err.message}`);
          setIsLoading(false);
        }
      );
    };

    createPuzzlePieces();
  }, [difficulty, imageUrl, isInitialized]);

  // Animation and controls
  useEffect(() => {
    if (!isInitialized) return;

    const animate = () => {
      if (!rendererRef.current || !sceneRef.current || !cameraRef.current) return;
      
      animationFrameRef.current = requestAnimationFrame(animate);
      orbitControlsRef.current?.update();
      rendererRef.current.render(sceneRef.current, cameraRef.current);
    };

    animate();

    const handleResize = () => {
      if (!containerRef.current || !cameraRef.current || !rendererRef.current) return;

      const width = containerRef.current.clientWidth || 800;
      const height = containerRef.current.clientHeight || 600;

      cameraRef.current.aspect = width / height;
      cameraRef.current.updateProjectionMatrix();
      rendererRef.current.setSize(width, height);
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [isInitialized]);

  const setupDragControls = () => {
    if (!piecesRef.current.length || !cameraRef.current || !rendererRef.current) return;

    const pieces = piecesRef.current.map(piece => piece.mesh).filter(Boolean);
    if (pieces.length === 0) return;

    try {
      controlsRef.current = new DragControls(pieces, cameraRef.current, rendererRef.current.domElement);

      controlsRef.current.addEventListener('dragstart', () => {
        if (orbitControlsRef.current) {
          orbitControlsRef.current.enabled = false;
        }
      });

      controlsRef.current.addEventListener('dragend', (event) => {
        if (orbitControlsRef.current) {
          orbitControlsRef.current.enabled = true;
        }
        
        const piece = piecesRef.current.find(p => p.mesh === event.object);
        if (piece && piece.isNearOriginalPosition()) {
          piece.snapToPosition();
          onPiecePlace?.();

          const isComplete = piecesRef.current.every(p => p.isPlaced);
          if (isComplete) {
            onComplete?.();
          }
        }
      });
    } catch (err) {
      setError(`Error setting up drag controls: ${err.message}`);
    }
  };

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