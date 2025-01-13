// PuzzleViewer.jsx
import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';

const PuzzleViewer = ({ imageUrl, onPieceClick, isMultiPlayer = false, dimensions = null }) => {
  const mountRef = useRef(null);
  const sceneRef = useRef(null);
  const piecesRef = useRef([]);
  const [error, setError] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!imageUrl) {
      setError('Image URL is required');
      return;
    }

    let renderer, camera, controls;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf0f0f0);

    const initScene = () => {
      const container = mountRef.current;
      const width = container.clientWidth;
      const height = container.clientHeight;

      camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000);
      renderer = new THREE.WebGLRenderer({ antialias: true });
      
      renderer.setSize(width, height);
      container.appendChild(renderer.domElement);

      controls = new OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;
      controls.dampingFactor = 0.05;
      camera.position.z = 5;
    };

    const createPuzzlePieces = async () => {
      try {
        setIsLoading(true);
        const textureLoader = new THREE.TextureLoader();
        
        const texture = await new Promise((resolve, reject) => {
          textureLoader.load(
            imageUrl,
            (tex) => {
              if (dimensions) {
                tex.repeat.set(1/4, 1/4);
                resolve(tex);
              } else {
                resolve(tex);
              }
            },
            undefined,
            (error) => reject(new Error(`Failed to load texture: ${error.message}`))
          );
        });

        // Calculate piece size based on dimensions if provided
        const pieceWidth = dimensions ? dimensions.width / 4 : 1;
        const pieceHeight = dimensions ? dimensions.height / 4 : 1;
        const geometry = new THREE.PlaneGeometry(pieceWidth, pieceHeight);

        // Clear existing pieces
        piecesRef.current.forEach(piece => {
          piece.geometry.dispose();
          piece.material.dispose();
          scene.remove(piece);
        });
        piecesRef.current = [];

        // Create grid of pieces
        const pieces = [];
        for (let i = 0; i < 4; i++) {
          for (let j = 0; j < 4; j++) {
            const material = new THREE.MeshBasicMaterial({
              map: texture.clone(),
              side: THREE.DoubleSide
            });

            // Set UV mapping for each piece
            const uvs = geometry.attributes.uv;
            const positions = uvs.array;
            for (let k = 0; k < positions.length; k += 2) {
              positions[k] = (positions[k] + i) / 4;
              positions[k + 1] = (positions[k + 1] + j) / 4;
            }

            const piece = new THREE.Mesh(geometry, material);
            piece.position.set(
              (i - 1.5) * pieceWidth,
              (j - 1.5) * pieceHeight,
              0
            );
            
            piece.userData = { 
              id: `piece-${i}-${j}`,
              gridPosition: { x: i, y: j }
            };
            
            if (isMultiPlayer) {
              piece.userData.originalPosition = piece.position.clone();
            }

            scene.add(piece);
            pieces.push(piece);
          }
        }

        piecesRef.current = pieces;
        setIsLoading(false);
      } catch (err) {
        setError(`Error creating puzzle pieces: ${err.message}`);
        setIsLoading(false);
        console.error('Error creating puzzle pieces:', err);
      }
    };

    const handleResize = () => {
      if (camera && renderer && mountRef.current) {
        const container = mountRef.current;
        const width = container.clientWidth;
        const height = container.clientHeight;

        camera.aspect = width / height;
        camera.updateProjectionMatrix();
        renderer.setSize(width, height);
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

      // Add click handling for puzzle pieces
      const raycaster = new THREE.Raycaster();
      const mouse = new THREE.Vector2();

      const handleClick = (event) => {
        const rect = renderer.domElement.getBoundingClientRect();
        mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

        raycaster.setFromCamera(mouse, camera);
        const intersects = raycaster.intersectObjects(piecesRef.current);

        if (intersects.length > 0) {
          const piece = intersects[0].object;
          onPieceClick && onPieceClick(piece.userData);
        }
      };

      renderer.domElement.addEventListener('click', handleClick);

      return () => {
        window.removeEventListener('resize', handleResize);
        renderer.domElement.removeEventListener('click', handleClick);
        if (mountRef.current && renderer.domElement) {
          mountRef.current.removeChild(renderer.domElement);
        }
        piecesRef.current.forEach(piece => {
          piece.geometry.dispose();
          piece.material.dispose();
        });
        renderer.dispose();
      };
    } catch (err) {
      setError(`Error initializing scene: ${err.message}`);
      console.error('Error initializing scene:', err);
    }
  }, [imageUrl, dimensions, isMultiPlayer]);

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
      ref={mountRef} 
      className="puzzle-viewer-container"
      style={{ width: '100%', height: '100vh' }} 
    />
  );
};

export default PuzzleViewer;