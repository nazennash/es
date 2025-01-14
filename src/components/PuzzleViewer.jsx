import React, { useEffect, useRef, useState, useLayoutEffect } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';

const PuzzleViewer = ({
  imageUrl,
  onPieceClick,
  isMultiPlayer = false,
  dimensions = null,
  onSceneReady,
  onError,
  gridSize = { rows: 4, cols: 4 }
}) => {
  const mountRef = useRef(null);
  const sceneRef = useRef(null);
  const rendererRef = useRef(null);
  const cameraRef = useRef(null);
  const controlsRef = useRef(null);
  const piecesRef = useRef([]);
  const animationFrameRef = useRef(null);
  
  const [error, setError] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });

  // Update container size on mount and resize
  useLayoutEffect(() => {
    if (!mountRef.current) return;

    const updateSize = () => {
      const { clientWidth, clientHeight } = mountRef.current;
      setContainerSize({
        width: clientWidth || window.innerWidth,
        height: clientHeight || window.innerHeight
      });
    };

    updateSize();
    window.addEventListener('resize', updateSize);

    return () => window.removeEventListener('resize', updateSize);
  }, []);

  // Clean up THREE.js resources
  const cleanup = () => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }

    if (controlsRef.current) {
      controlsRef.current.dispose();
    }

    piecesRef.current.forEach(piece => {
      if (piece.geometry) piece.geometry.dispose();
      if (piece.material) {
        if (piece.material.map) piece.material.map.dispose();
        piece.material.dispose();
      }
    });

    if (rendererRef.current) {
      rendererRef.current.dispose();
      const domElement = rendererRef.current.domElement;
      domElement?.parentElement?.removeChild(domElement);
    }

    sceneRef.current = null;
    rendererRef.current = null;
    cameraRef.current = null;
    controlsRef.current = null;
    piecesRef.current = [];
  };

  // Initialize THREE.js scene
  const initScene = () => {
    if (!mountRef.current || containerSize.width === 0) return false;

    try {
      // Create scene
      const scene = new THREE.Scene();
      scene.background = new THREE.Color(0xf0f0f0);
      sceneRef.current = scene;

      // Create camera
      const camera = new THREE.PerspectiveCamera(
        75,
        containerSize.width / containerSize.height,
        0.1,
        1000
      );
      camera.position.z = 5;
      cameraRef.current = camera;

      // Create renderer
      const renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: true,
        preserveDrawingBuffer: true
      });
      renderer.setSize(containerSize.width, containerSize.height);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      mountRef.current.appendChild(renderer.domElement);
      rendererRef.current = renderer;

      // Create controls
      const controls = new OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;
      controls.dampingFactor = 0.05;
      controls.enableZoom = true;
      controls.enablePan = true;
      controls.maxDistance = 10;
      controls.minDistance = 2;
      controlsRef.current = controls;

      return true;
    } catch (err) {
      console.error('Scene initialization error:', err);
      setError('Failed to initialize puzzle viewer');
      onError?.('Failed to initialize puzzle viewer');
      return false;
    }
  };

  // Create puzzle pieces
  const createPuzzlePieces = async () => {
    if (!sceneRef.current || !imageUrl) return false;

    try {
      const textureLoader = new THREE.TextureLoader();
      
      // Load texture
      const texture = await new Promise((resolve, reject) => {
        const loader = new THREE.TextureLoader();
        loader.load(
          imageUrl,
          (tex) => {
            tex.generateMipmaps = true;
            tex.minFilter = THREE.LinearMipmapLinearFilter;
            tex.magFilter = THREE.LinearFilter;
            resolve(tex);
          },
          undefined,
          (err) => reject(new Error(`Failed to load texture: ${err.message}`))
        );
      });

      // Calculate piece dimensions
      const { rows, cols } = gridSize;
      const aspectRatio = texture.image.width / texture.image.height;
      const pieceWidth = dimensions?.width ? dimensions.width / cols : 1;
      const pieceHeight = dimensions?.height ? dimensions.height / rows : pieceWidth / aspectRatio;

      // Create piece geometry
      const geometry = new THREE.PlaneGeometry(pieceWidth, pieceHeight);

      // Clear existing pieces
      piecesRef.current.forEach(piece => {
        if (piece.geometry) piece.geometry.dispose();
        if (piece.material) {
          if (piece.material.map) piece.material.map.dispose();
          piece.material.dispose();
        }
        sceneRef.current.remove(piece);
      });
      piecesRef.current = [];

      // Create new pieces
      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
          // Create piece material with proper UV mapping
          const material = new THREE.MeshBasicMaterial({
            map: texture.clone(),
            side: THREE.DoubleSide
          });

          // Update UV coordinates
          const uvs = new Float32Array([
            col / cols, (row + 1) / rows,
            (col + 1) / cols, (row + 1) / rows,
            col / cols, row / rows,
            (col + 1) / cols, row / rows
          ]);
          geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));

          // Create mesh
          const piece = new THREE.Mesh(geometry, material);
          
          // Position piece
          piece.position.set(
            (col - (cols - 1) / 2) * pieceWidth,
            ((rows - 1) / 2 - row) * pieceHeight,
            0
          );

          // Add metadata
          piece.userData = {
            id: `piece-${row}-${col}`,
            gridPosition: { row, col },
            originalPosition: piece.position.clone()
          };

          if (isMultiPlayer) {
            piece.userData.isPlaced = false;
            piece.userData.currentPlayer = null;
          }

          sceneRef.current.add(piece);
          piecesRef.current.push(piece);
        }
      }

      return true;
    } catch (err) {
      console.error('Error creating puzzle pieces:', err);
      setError('Failed to create puzzle pieces');
      onError?.('Failed to create puzzle pieces');
      return false;
    }
  };

  // Handle window resize
  const handleResize = () => {
    if (!cameraRef.current || !rendererRef.current || !mountRef.current) return;

    const width = mountRef.current.clientWidth;
    const height = mountRef.current.clientHeight;

    cameraRef.current.aspect = width / height;
    cameraRef.current.updateProjectionMatrix();
    rendererRef.current.setSize(width, height);
  };

  // Animation loop
  const animate = () => {
    if (!rendererRef.current || !sceneRef.current || !cameraRef.current) return;

    animationFrameRef.current = requestAnimationFrame(animate);
    controlsRef.current?.update();
    rendererRef.current.render(sceneRef.current, cameraRef.current);
  };

  // Handle piece click
  const handleClick = (event) => {
    if (!onPieceClick || !rendererRef.current || !cameraRef.current) return;

    const rect = rendererRef.current.domElement.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    const y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(new THREE.Vector2(x, y), cameraRef.current);
    
    const intersects = raycaster.intersectObjects(piecesRef.current);
    if (intersects.length > 0) {
      const piece = intersects[0].object;
      onPieceClick(piece.userData);
    }
  };

  // Initialize scene and pieces
  useEffect(() => {
    if (containerSize.width === 0) return;

    const init = async () => {
      try {
        setIsLoading(true);
        
        const sceneInitialized = initScene();
        if (!sceneInitialized) return;

        const piecesCreated = await createPuzzlePieces();
        if (!piecesCreated) return;

        window.addEventListener('resize', handleResize);
        rendererRef.current?.domElement.addEventListener('click', handleClick);

        animate();
        setIsLoading(false);
        onSceneReady?.();

      } catch (err) {
        console.error('Initialization error:', err);
        setError('Failed to initialize puzzle');
        onError?.('Failed to initialize puzzle');
        setIsLoading(false);
      }
    };

    init();

    return () => {
      window.removeEventListener('resize', handleResize);
      rendererRef.current?.domElement.removeEventListener('click', handleClick);
      cleanup();
    };
  }, [imageUrl, containerSize.width, containerSize.height]);

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
      style={{ 
        width: '100%', 
        height: '100vh',
        position: 'relative'
      }}
    />
  );
};

export default PuzzleViewer;