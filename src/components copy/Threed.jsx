import React, { useState, useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { ZoomIn, ZoomOut, RotateCw, Play, Home, LogOut, Share2 } from 'lucide-react';

const ThreeDPuzzle = ({ imageUrl, difficulty, onComplete }) => {
  const mountRef = useRef(null);
  const controlsRef = useRef(null);
  const [scene, setScene] = useState(null);
  const [camera, setCamera] = useState(null);
  const [renderer, setRenderer] = useState(null);
  const [pieces, setPieces] = useState([]);
  const [selectedPiece, setSelectedPiece] = useState(null);
  const [isInitialized, setIsInitialized] = useState(false);

  // Initialize Three.js scene
  useEffect(() => {
    if (!mountRef.current || isInitialized) return;

    // Scene setup
    const newScene = new THREE.Scene();
    newScene.background = new THREE.Color(0xf0f0f0);

    // Camera setup
    const newCamera = new THREE.PerspectiveCamera(
      75,
      window.innerWidth / window.innerHeight,
      0.1,
      1000
    );
    newCamera.position.z = 5;

    // Renderer setup
    const newRenderer = new THREE.WebGLRenderer({ antialias: true });
    newRenderer.setSize(window.innerWidth, window.innerHeight);
    mountRef.current.appendChild(newRenderer.domElement);

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(0, 1, 1);
    newScene.add(ambientLight, directionalLight);

    // Controls
    const controls = new OrbitControls(newCamera, newRenderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controlsRef.current = controls;

    setScene(newScene);
    setCamera(newCamera);
    setRenderer(newRenderer);
    setIsInitialized(true);

    // Handle window resize
    const handleResize = () => {
      newCamera.aspect = window.innerWidth / window.innerHeight;
      newCamera.updateProjectionMatrix();
      newRenderer.setSize(window.innerWidth, window.innerHeight);
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      mountRef.current?.removeChild(newRenderer.domElement);
      newRenderer.dispose();
    };
  }, [isInitialized]);

  // Create puzzle pieces when image is loaded
  useEffect(() => {
    if (!scene || !imageUrl) return;

    const textureLoader = new THREE.TextureLoader();
    textureLoader.load(imageUrl, (texture) => {
      // Clear existing pieces
      pieces.forEach(piece => scene.remove(piece.mesh));
      setPieces([]);

      const pieceSize = 1 / difficulty;
      const newPieces = [];

      for (let i = 0; i < difficulty; i++) {
        for (let j = 0; j < difficulty; j++) {
          // Create piece geometry with slight extrusion
          const geometry = new THREE.BoxGeometry(pieceSize, pieceSize, 0.1);
          
          // Calculate UV mapping for this piece
          const uvs = geometry.attributes.uv;
          const positions = uvs.array;
          
          for (let k = 0; k < positions.length; k += 2) {
            positions[k] = (positions[k] + j) / difficulty;
            positions[k + 1] = (positions[k + 1] + i) / difficulty;
          }

          // Create material with the image texture
          const material = new THREE.MeshPhongMaterial({
            map: texture,
            transparent: true,
            opacity: 0.9
          });

          const mesh = new THREE.Mesh(geometry, material);

          // Set initial position (scattered around)
          const randomPosition = new THREE.Vector3(
            (Math.random() - 0.5) * 3,
            (Math.random() - 0.5) * 3,
            (Math.random() - 0.5) * 0.5
          );
          mesh.position.copy(randomPosition);

          // Store correct position for checking completion
          const correctPosition = new THREE.Vector3(
            (j - difficulty / 2 + 0.5) * pieceSize,
            -(i - difficulty / 2 + 0.5) * pieceSize,
            0
          );

          const piece = {
            mesh,
            correctPosition,
            isPlaced: false
          };

          newPieces.push(piece);
          scene.add(mesh);
        }
      }

      setPieces(newPieces);
    });
  }, [scene, imageUrl, difficulty]);

  // Animation loop
  useEffect(() => {
    if (!scene || !camera || !renderer) return;

    const animate = () => {
      requestAnimationFrame(animate);
      controlsRef.current?.update();
      renderer.render(scene, camera);

      // Check if puzzle is complete
      const isComplete = pieces.every(piece => piece.isPlaced);
      if (isComplete) {
        onComplete?.();
      }
    };

    animate();
  }, [scene, camera, renderer, pieces, onComplete]);

  // Handle piece selection and movement
  useEffect(() => {
    if (!scene || !camera) return;

    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    const onMouseDown = (event) => {
      mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
      mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

      raycaster.setFromCamera(mouse, camera);
      const intersects = raycaster.intersectObjects(pieces.map(p => p.mesh));

      if (intersects.length > 0) {
        const selectedMesh = intersects[0].object;
        const piece = pieces.find(p => p.mesh === selectedMesh);
        setSelectedPiece(piece);
        
        // Highlight selected piece
        selectedMesh.material.opacity = 1;
      }
    };

    const onMouseUp = () => {
      if (selectedPiece) {
        const piece = selectedPiece;
        const distance = piece.mesh.position.distanceTo(piece.correctPosition);

        // Snap to correct position if close enough
        if (distance < 0.2) {
          piece.mesh.position.copy(piece.correctPosition);
          piece.isPlaced = true;
          piece.mesh.material.opacity = 0.9;
        }

        setSelectedPiece(null);
      }
    };

    window.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mouseup', onMouseUp);

    return () => {
      window.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [scene, camera, pieces, selectedPiece]);

  return (
    <div className="relative w-full h-screen">
      <div ref={mountRef} className="w-full h-full" />
      
      {/* Controls UI */}
      <div className="absolute top-4 left-4 flex gap-2">
        <button
          onClick={() => camera?.position.z += 0.5}
          className="p-2 bg-white rounded shadow hover:bg-gray-100"
        >
          <ZoomOut className="h-4 w-4" />
        </button>
        <button
          onClick={() => camera?.position.z -= 0.5}
          className="p-2 bg-white rounded shadow hover:bg-gray-100"
        >
          <ZoomIn className="h-4 w-4" />
        </button>
        <button
          onClick={() => controlsRef.current?.reset()}
          className="p-2 bg-white rounded shadow hover:bg-gray-100"
        >
          <RotateCw className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
};

export default ThreeDPuzzle;