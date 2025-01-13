// src/components/PuzzlePieceManager.jsx
import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { DragControls } from 'three/examples/jsm/controls/DragControls';

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

const PuzzlePieceManager = ({ imageUrl, difficulty = 3, onPiecePlace }) => {
  const containerRef = useRef(null);
  const piecesRef = useRef([]);
  const controlsRef = useRef(null);

  useEffect(() => {
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    
    // Create puzzle pieces from image
    const createPuzzlePieces = async () => {
      const texture = await new THREE.TextureLoader().loadAsync(imageUrl);
      const aspectRatio = texture.image.width / texture.image.height;
      
      // Calculate piece dimensions
      const pieceWidth = 1 / difficulty;
      const pieceHeight = (1 / difficulty) * aspectRatio;
      
      // Create pieces with bas-relief effect
      for (let i = 0; i < difficulty; i++) {
        for (let j = 0; j < difficulty; j++) {
          // Create geometry with height variation for bas-relief
          const geometry = new THREE.PlaneGeometry(pieceWidth, pieceHeight, 10, 10);
          const heightMap = generateHeightMap(texture, i, j, difficulty);
          applyHeightMap(geometry, heightMap);
          
          // Create textured material
          const material = new THREE.MeshPhongMaterial({
            map: texture,
            bumpMap: texture,
            bumpScale: 0.1,
          });
          
          // Calculate positions
          const originalPosition = new THREE.Vector3(
            (i - difficulty / 2) * pieceWidth,
            (j - difficulty / 2) * pieceHeight,
            0
          );
          
          // Create piece with random initial position
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
    };

    // Set up drag controls
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
          
          // Animate piece placement
          const flashMaterial = piece.mesh.material.clone();
          piece.mesh.material = flashMaterial;
          flashMaterial.emissive.setHex(0x00ff00);
          setTimeout(() => {
            flashMaterial.emissive.setHex(0x000000);
          }, 300);
        }
      });
    };

    // Initialize scene
    const init = async () => {
      renderer.setSize(window.innerWidth, window.innerHeight);
      containerRef.current.appendChild(renderer.domElement);
      
      camera.position.z = 5;
      
      // Add lights
      const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
      scene.add(ambientLight);
      
      const directionalLight = new THREE.DirectionalLight(0xffffff, 0.5);
      directionalLight.position.set(5, 5, 5);
      scene.add(directionalLight);
      
      await createPuzzlePieces();
      setupDragControls();
      
      // Animation loop
      const animate = () => {
        requestAnimationFrame(animate);
        renderer.render(scene, camera);
      };
      animate();
    };

    init();

    return () => {
      containerRef.current?.removeChild(renderer.domElement);
      piecesRef.current = [];
    };
  }, [imageUrl, difficulty, onPiecePlace]);

  return <div ref={containerRef} />;
};

// Helper functions
const generateHeightMap = (texture, x, y, difficulty) => {
  // Implementation of height map generation based on image intensity
  // This creates the bas-relief effect
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  // ... height map generation logic
  return new Float32Array(/* height data */);
};

const applyHeightMap = (geometry, heightMap) => {
  // Apply height map to geometry vertices
  const positions = geometry.attributes.position.array;
  for (let i = 0; i < positions.length; i += 3) {
    positions[i + 2] = heightMap[i / 3] * 0.1; // Z-axis modification
  }
  geometry.attributes.position.needsUpdate = true;
};

export default PuzzlePieceManager;