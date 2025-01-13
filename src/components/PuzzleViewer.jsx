// src/components/PuzzleViewer.jsx
import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';

const PuzzleViewer = ({ imageUrl, onPieceClick, isMultiPlayer = false }) => {
  const mountRef = useRef(null);
  const sceneRef = useRef(null);
  const piecesRef = useRef([]);

  useEffect(() => {
    // Initialize Three.js scene
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    
    renderer.setSize(window.innerWidth, window.innerHeight);
    mountRef.current.appendChild(renderer.domElement);
    
    // Add OrbitControls
    const controls = new OrbitControls(camera, renderer.domElement);
    camera.position.z = 5;
    
    // Create puzzle pieces
    const createPuzzlePieces = async () => {
      const texture = await new THREE.TextureLoader().loadAsync(imageUrl);
      const geometry = new THREE.PlaneGeometry(1, 1);
      const material = new THREE.MeshBasicMaterial({ map: texture });
      
      // Divide into pieces (4x4 grid example)
      for (let i = 0; i < 4; i++) {
        for (let j = 0; j < 4; j++) {
          const piece = new THREE.Mesh(geometry, material);
          piece.position.set(i - 1.5, j - 1.5, 0);
          piece.userData = { id: `piece-${i}-${j}` };
          scene.add(piece);
          piecesRef.current.push(piece);
        }
      }
    };

    createPuzzlePieces();

    // Animation loop
    const animate = () => {
      requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    sceneRef.current = scene;

    return () => {
      mountRef.current.removeChild(renderer.domElement);
    };
  }, [imageUrl]);

  return <div ref={mountRef} style={{ width: '100%', height: '100vh' }} />;
};

export default PuzzleViewer;