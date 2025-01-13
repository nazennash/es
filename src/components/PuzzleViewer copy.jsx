import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';

const PuzzleViewer = ({ imageUrl, onPieceClick, isMultiPlayer = false }) => {
  const mountRef = useRef(null);
  const sceneRef = useRef(null);
  const piecesRef = useRef([]);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!imageUrl) {
      setError('Image URL is required');
      return;
    }

    let renderer, camera, controls;
    const scene = new THREE.Scene();
    
    const initScene = () => {
      // Initialize Three.js scene
      camera = new THREE.PerspectiveCamera(
        75,
        window.innerWidth / window.innerHeight,
        0.1,
        1000
      );
      renderer = new THREE.WebGLRenderer({ antialias: true });
      
      renderer.setSize(window.innerWidth, window.innerHeight);
      mountRef.current?.appendChild(renderer.domElement);
      
      // Add OrbitControls
      controls = new OrbitControls(camera, renderer.domElement);
      camera.position.z = 5;
    };

    const createPuzzlePieces = async () => {
      try {
        const textureLoader = new THREE.TextureLoader();
        
        // Convert the loadAsync to a proper promise
        const texture = await new Promise((resolve, reject) => {
          textureLoader.load(
            imageUrl,
            (tex) => resolve(tex),
            undefined, // onProgress callback (optional)
            (error) => reject(new Error(`Failed to load texture: ${error.message}`))
          );
        });

        const geometry = new THREE.PlaneGeometry(1, 1);
        
        // Clear existing pieces
        piecesRef.current.forEach(piece => {
          scene.remove(piece);
        });
        piecesRef.current = [];

        // Create new pieces
        for (let i = 0; i < 4; i++) {
          for (let j = 0; j < 4; j++) {
            const material = new THREE.MeshBasicMaterial({
              map: texture.clone() // Clone texture for each piece
            });
            const piece = new THREE.Mesh(geometry, material);
            piece.position.set(i - 1.5, j - 1.5, 0);
            piece.userData = { id: `piece-${i}-${j}` };
            scene.add(piece);
            piecesRef.current.push(piece);
          }
        }
      } catch (err) {
        setError(`Error creating puzzle pieces: ${err.message}`);
        console.error('Error creating puzzle pieces:', err);
      }
    };

    const handleResize = () => {
      if (camera && renderer) {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
      }
    };

    const animate = () => {
      if (!renderer) return;
      requestAnimationFrame(animate);
      controls?.update();
      renderer.render(scene, camera);
    };

    try {
      initScene();
      createPuzzlePieces();
      animate();
      
      window.addEventListener('resize', handleResize);
      
      sceneRef.current = scene;
    } catch (err) {
      setError(`Error initializing scene: ${err.message}`);
      console.error('Error initializing scene:', err);
    }

    return () => {
      window.removeEventListener('resize', handleResize);
      if (renderer && mountRef.current) {
        mountRef.current.removeChild(renderer.domElement);
      }
      // Clean up resources
      piecesRef.current.forEach(piece => {
        piece.geometry.dispose();
        piece.material.dispose();
      });
      renderer?.dispose();
    };
  }, [imageUrl]);

  if (error) {
    return <div className="error-message">{error}</div>;
  }

  return <div ref={mountRef} style={{ width: '100%', height: '100vh' }} />;
};

export default PuzzleViewer;