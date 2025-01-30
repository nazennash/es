import React, { useState, useEffect, useRef } from 'react';
import { useMultiplayerGame } from '../../../hooks/useMultiplayerGame';
import { database, ref, set, update } from '../../../firebase';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';

const MultiplayerManager = ({ gameId, isHost, user }) => {
  const navigate = useNavigate();
  const containerRef = useRef(null);
  const engineRef = useRef(null);
  const [image, setImage] = useState(null);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);

  const {
    players,
    gameState,
    error,
    updatePiecePosition,
    syncPuzzleState
  } = useMultiplayerGame(gameId);

  // Initialize Three.js engine
  useEffect(() => {
    if (!containerRef.current) return;

    const container = containerRef.current;
    const engine = {
      scene: new THREE.Scene(),
      camera: new THREE.PerspectiveCamera(
        75,
        container.clientWidth / container.clientHeight,
        0.1,
        1000
      ),
      renderer: new THREE.WebGLRenderer({ antialias: true }),
      controls: null,
      pieces: new Map(),
      init() {
        // Setup scene
        this.scene.background = new THREE.Color(0x1a1a1a);
        
        // Setup camera
        this.camera.position.z = 5;
        
        // Setup renderer
        this.renderer.setSize(container.clientWidth, container.clientHeight);
        this.renderer.setPixelRatio(window.devicePixelRatio);
        container.appendChild(this.renderer.domElement);
        
        // Setup controls
        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;
        
        // Add lights
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
        this.scene.add(ambientLight);
        
        const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
        directionalLight.position.set(5, 5, 5);
        this.scene.add(directionalLight);
        
        // Start animation loop
        this.animate();
      },
      animate() {
        requestAnimationFrame(() => this.animate());
        this.controls.update();
        this.renderer.render(this.scene, this.camera);
      },
      createPuzzlePieces(imageUrl, gridSize = { x: 4, y: 3 }) {
        return new Promise(async (resolve) => {
          const texture = await new THREE.TextureLoader().loadAsync(imageUrl);
          const aspectRatio = texture.image.width / texture.image.height;
          
          // Clear existing pieces
          this.pieces.forEach(piece => this.scene.remove(piece));
          this.pieces.clear();
          
          // Create pieces
          for (let y = 0; y < gridSize.y; y++) {
            for (let x = 0; x < gridSize.x; x++) {
              const geometry = new THREE.PlaneGeometry(
                aspectRatio / gridSize.x * 0.95,
                1 / gridSize.y * 0.95
              );
              
              const material = new THREE.MeshPhongMaterial({
                map: texture,
                side: THREE.DoubleSide
              });
              
              const piece = new THREE.Mesh(geometry, material);
              
              // Set initial position
              piece.position.x = (x - gridSize.x / 2 + 0.5) * (aspectRatio / gridSize.x);
              piece.position.y = (y - gridSize.y / 2 + 0.5) * (1 / gridSize.y);
              
              // Set piece data
              piece.userData = {
                id: `piece_${x}_${y}`,
                originalPosition: piece.position.clone(),
                isPlaced: false
              };
              
              this.scene.add(piece);
              this.pieces.set(piece.userData.id, piece);
            }
          }
          
          this.scramblePieces();
          resolve();
        });
      },
      scramblePieces() {
        this.pieces.forEach(piece => {
          if (!piece.userData.isPlaced) {
            piece.position.x += (Math.random() - 0.5) * 2;
            piece.position.y += (Math.random() - 0.5) * 2;
            piece.position.z = Math.random() * 0.1;
          }
        });
      }
    };
    
    engine.init();
    engineRef.current = engine;

    return () => {
      container.removeChild(engine.renderer.domElement);
      engine.renderer.dispose();
    };
  }, []);

  // Handle image upload (host only)
  const handleImageUpload = async (event) => {
    if (!isHost || !event.target.files[0]) return;

    const file = event.target.files[0];
    setLoading(true);

    try {
      const reader = new FileReader();
      reader.onload = async (e) => {
        const imageData = e.target.result;
        setImage(imageData);
        
        // Create puzzle pieces
        await engineRef.current?.createPuzzlePieces(imageData);
        
        // Sync with other players
        await syncPuzzleState({
          imageUrl: imageData,
          createdAt: Date.now(),
          gridSize: { x: 4, y: 3 }
        });
        
        setLoading(false);
      };
      reader.readAsDataURL(file);
    } catch (error) {
      console.error('Error uploading image:', error);
      toast.error('Failed to upload image');
      setLoading(false);
    }
  };

  // Handle piece movement
  useEffect(() => {
    if (!engineRef.current) return;

    const engine = engineRef.current;
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();
    let selectedPiece = null;
    let isDragging = false;

    const onMouseDown = (event) => {
      const rect = engine.renderer.domElement.getBoundingClientRect();
      mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(mouse, engine.camera);
      const intersects = raycaster.intersectObjects([...engine.pieces.values()]);

      if (intersects.length > 0) {
        selectedPiece = intersects[0].object;
        isDragging = true;
        engine.controls.enabled = false;
      }
    };

    const onMouseMove = (event) => {
      if (!isDragging || !selectedPiece) return;

      const rect = engine.renderer.domElement.getBoundingClientRect();
      mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(mouse, engine.camera);
      const intersectPoint = new THREE.Vector3();
      raycaster.ray.intersectPlane(
        new THREE.Plane(new THREE.Vector3(0, 0, 1)),
        intersectPoint
      );

      selectedPiece.position.copy(intersectPoint);
      
      // Sync piece position
      updatePiecePosition(selectedPiece.userData.id, {
        x: selectedPiece.position.x,
        y: selectedPiece.position.y,
        z: selectedPiece.position.z
      });
    };

    const onMouseUp = () => {
      if (!selectedPiece) return;

      const originalPos = selectedPiece.userData.originalPosition;
      const distance = originalPos.distanceTo(selectedPiece.position);

      if (distance < 0.3) {
        selectedPiece.position.copy(originalPos);
        selectedPiece.userData.isPlaced = true;
        updatePiecePosition(selectedPiece.userData.id, {
          x: originalPos.x,
          y: originalPos.y,
          z: originalPos.z,
          isPlaced: true
        });
      }

      selectedPiece = null;
      isDragging = false;
      engine.controls.enabled = true;
    };

    const element = engine.renderer.domElement;
    element.addEventListener('mousedown', onMouseDown);
    element.addEventListener('mousemove', onMouseMove);
    element.addEventListener('mouseup', onMouseUp);

    return () => {
      element.removeEventListener('mousedown', onMouseDown);
      element.removeEventListener('mousemove', onMouseMove);
      element.removeEventListener('mouseup', onMouseUp);
    };
  }, [updatePiecePosition]);

  // Sync piece movements from other players
  useEffect(() => {
    if (!gameState?.pieces || !engineRef.current) return;

    Object.entries(gameState.pieces).forEach(([pieceId, pieceData]) => {
      const piece = engineRef.current.pieces.get(pieceId);
      if (piece) {
        piece.position.set(pieceData.x, pieceData.y, pieceData.z);
        piece.userData.isPlaced = pieceData.isPlaced;
      }
    });
  }, [gameState?.pieces]);

  // Load initial puzzle state
  useEffect(() => {
    if (!isHost && gameState?.puzzle?.imageUrl) {
      setImage(gameState.puzzle.imageUrl);
      engineRef.current?.createPuzzlePieces(
        gameState.puzzle.imageUrl,
        gameState.puzzle.gridSize
      );
    }
  }, [isHost, gameState?.puzzle]);

  return (
    <div className="h-screen flex flex-col">
      {/* Header */}
      <div className="bg-gray-800 p-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          {isHost && !image && (
            <label className="cursor-pointer bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600">
              Upload Image
              <input
                type="file"
                accept="image/*"
                onChange={handleImageUpload}
                className="hidden"
              />
            </label>
          )}
          <div className="text-white">
            Players: {Object.keys(players).length}
          </div>
        </div>
        {progress > 0 && (
          <div className="text-white">
            Progress: {Math.round(progress)}%
          </div>
        )}
      </div>

      {/* Game area */}
      <div className="flex-1 relative">
        {loading && (
          <div className="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center">
            <div className="text-white">Loading...</div>
          </div>
        )}
        <div ref={containerRef} className="w-full h-full" />
      </div>
    </div>
  );
};

export default MultiplayerManager;