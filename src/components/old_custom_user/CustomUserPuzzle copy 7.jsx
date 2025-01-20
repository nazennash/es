import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { DragControls } from 'three/examples/jsm/controls/DragControls';
import { gsap } from 'gsap';

const ImagePuzzle3D = () => {
  const mountRef = useRef(null);
  const [scene, setScene] = useState(null);
  const [camera, setCamera] = useState(null);
  const [renderer, setRenderer] = useState(null);
  const [pieces, setPieces] = useState([]);
  const [dragControls, setDragControls] = useState(null);
  const [orbitControls, setOrbitControls] = useState(null);
  const [stats, setStats] = useState({
    totalPieces: 0,
    placedPieces: 0,
    startTime: null,
    elapsedTime: 0,
  });

  // Initialize Three.js scene
  const initScene = useCallback(() => {
    const newScene = new THREE.Scene();
    newScene.background = new THREE.Color(0x1a1a2e);

    const newCamera = new THREE.PerspectiveCamera(
      75,
      window.innerWidth / window.innerHeight,
      0.1,
      1000
    );
    newCamera.position.set(0, 5, 10);

    const newRenderer = new THREE.WebGLRenderer({ antialias: true });
    newRenderer.setSize(window.innerWidth, window.innerHeight);
    newRenderer.shadowMap.enabled = true;

    // Add lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    newScene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(5, 5, 5);
    directionalLight.castShadow = true;
    newScene.add(directionalLight);

    // Add verification area (blue box)
    const verificationGeometry = new THREE.BoxGeometry(10, 0.1, 10);
    const verificationMaterial = new THREE.MeshPhongMaterial({
      color: 0x1e3f66,
      transparent: true,
      opacity: 0.3,
    });
    const verificationArea = new THREE.Mesh(verificationGeometry, verificationMaterial);
    verificationArea.position.y = -0.05;
    verificationArea.receiveShadow = true;
    newScene.add(verificationArea);

    // Add grid helper
    const gridHelper = new THREE.GridHelper(10, 10, 0x4299e1, 0x4299e1);
    gridHelper.position.y = 0;
    newScene.add(gridHelper);

    mountRef.current.appendChild(newRenderer.domElement);

    // Add OrbitControls
    const newOrbitControls = new OrbitControls(newCamera, newRenderer.domElement);
    newOrbitControls.enableDamping = true;
    newOrbitControls.dampingFactor = 0.05;

    setScene(newScene);
    setCamera(newCamera);
    setRenderer(newRenderer);
    setOrbitControls(newOrbitControls);

    return () => {
      mountRef.current?.removeChild(newRenderer.domElement);
      newRenderer.dispose();
    };
  }, []);

  // Create puzzle pieces from image
  const createPuzzlePieces = useCallback((image, rows = 4, cols = 4) => {
    if (!scene) return;

    const pieceWidth = image.width / cols;
    const pieceHeight = image.height / rows;
    const pieces = [];
    const geometry = new THREE.BoxGeometry(1, 0.1, 1);

    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        // Create canvas for piece texture
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        canvas.width = pieceWidth;
        canvas.height = pieceHeight;
        
        // Draw piece of original image
        context.drawImage(
          image,
          col * pieceWidth,
          row * pieceHeight,
          pieceWidth,
          pieceHeight,
          0,
          0,
          pieceWidth,
          pieceHeight
        );

        // Create texture from canvas
        const texture = new THREE.CanvasTexture(canvas);
        const materials = [
          new THREE.MeshPhongMaterial({ color: 0x2c5282 }), // Right
          new THREE.MeshPhongMaterial({ color: 0x2c5282 }), // Left
          new THREE.MeshPhongMaterial({ map: texture }), // Top
          new THREE.MeshPhongMaterial({ color: 0x2c5282 }), // Bottom
          new THREE.MeshPhongMaterial({ color: 0x2c5282 }), // Front
          new THREE.MeshPhongMaterial({ color: 0x2c5282 }), // Back
        ];

        const piece = new THREE.Mesh(geometry, materials);
        piece.position.set(
          (col - cols / 2) * 1.1 + 0.5,
          3,
          (row - rows / 2) * 1.1 + 0.5
        );
        piece.castShadow = true;
        piece.userData = {
          correctPosition: new THREE.Vector3(
            (col - cols / 2) * 1.1 + 0.5,
            0,
            (row - rows / 2) * 1.1 + 0.5
          ),
          isPlaced: false,
        };

        scene.add(piece);
        pieces.push(piece);
      }
    }

    // Initialize drag controls
    const newDragControls = new DragControls(pieces, camera, renderer.domElement);
    
    newDragControls.addEventListener('dragstart', () => {
      orbitControls.enabled = false;
    });

    newDragControls.addEventListener('dragend', (event) => {
      orbitControls.enabled = true;
      checkPiecePlacement(event.object);
    });

    setDragControls(newDragControls);
    setPieces(pieces);
    setStats(prev => ({ ...prev, totalPieces: pieces.length }));

  }, [scene, camera, renderer, orbitControls]);

  // Handle image upload
  const handleImageUpload = useCallback((event) => {
    const file = event.target.files[0];
    const reader = new FileReader();

    reader.onload = (e) => {
      const image = new Image();
      image.onload = () => {
        // Clear existing pieces
        pieces.forEach(piece => scene.remove(piece));
        setPieces([]);
        
        // Create new puzzle
        createPuzzlePieces(image);
        setStats(prev => ({
          ...prev,
          startTime: Date.now(),
          placedPieces: 0,
        }));
      };
      image.src = e.target.result;
    };
    reader.readAsDataURL(file);
  }, [scene, pieces, createPuzzlePieces]);

  // Check if piece is correctly placed
  const checkPiecePlacement = useCallback((piece) => {
    const tolerance = 0.5;
    const correctPos = piece.userData.correctPosition;
    const distance = piece.position.distanceTo(correctPos);

    if (distance < tolerance && !piece.userData.isPlaced) {
      gsap.to(piece.position, {
        x: correctPos.x,
        y: correctPos.y,
        z: correctPos.z,
        duration: 0.3,
        ease: 'power2.out',
      });
      piece.userData.isPlaced = true;
      setStats(prev => ({
        ...prev,
        placedPieces: prev.placedPieces + 1,
      }));
    }
  }, []);

  // Animation loop
  const animate = useCallback(() => {
    if (!renderer || !scene || !camera) return;

    requestAnimationFrame(animate);
    orbitControls?.update();
    renderer.render(scene, camera);

    // Update elapsed time
    if (stats.startTime) {
      setStats(prev => ({
        ...prev,
        elapsedTime: Math.floor((Date.now() - prev.startTime) / 1000),
      }));
    }
  }, [renderer, scene, camera, orbitControls, stats.startTime]);

  // Handle window resize
  const handleWindowResize = useCallback(() => {
    if (!camera || !renderer) return;

    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  }, [camera, renderer]);

  // Initialize everything
  useEffect(() => {
    initScene();
    return () => {
      // Cleanup
      pieces.forEach(piece => scene?.remove(piece));
      scene?.dispose();
      renderer?.dispose();
    };
  }, []);

  // Start animation loop
  useEffect(() => {
    animate();
    window.addEventListener('resize', handleWindowResize);
    return () => {
      window.removeEventListener('resize', handleWindowResize);
    };
  }, [animate, handleWindowResize]);

  // Format time for display
  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="relative w-full h-screen">
      {/* Three.js container */}
      <div ref={mountRef} className="absolute inset-0" />

      {/* UI Overlay */}
      <div className="absolute top-4 left-4 p-4 bg-blue-900 bg-opacity-80 rounded-lg">
        <input
          type="file"
          accept="image/*"
          onChange={handleImageUpload}
          className="block w-full text-sm text-white mb-2"
        />
        <div className="text-white">
          <p>Pieces: {stats.placedPieces}/{stats.totalPieces}</p>
          <p>Time: {formatTime(stats.elapsedTime)}</p>
          <p>Progress: {stats.totalPieces ? Math.round((stats.placedPieces / stats.totalPieces) * 100) : 0}%</p>
        </div>
      </div>

      {/* Instructions */}
      <div className="absolute bottom-4 left-4 p-4 bg-blue-900 bg-opacity-80 rounded-lg text-white text-sm">
        <p>Drag pieces to move them</p>
        <p>Right-click + drag to rotate view</p>
        <p>Scroll to zoom</p>
      </div>
    </div>
  );
};

export default ImagePuzzle3D;