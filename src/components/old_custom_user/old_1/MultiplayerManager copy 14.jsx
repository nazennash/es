import React, { useState, useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { getStorage, ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import { getDatabase, ref as dbRef, set, onValue, update, get } from 'firebase/database';
import { ZoomIn, ZoomOut, RotateCw, RotateCcw, Share2, Play, Users, Download, CameraIcon } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { LogOut, Home } from 'lucide-react';
import { handlePuzzleCompletion } from './PuzzleCompletionHandler';

// Separate Three.js scene management
class ThreeJSManager {
  constructor(container, onPieceSelect, onPieceMove, onPieceSnap) {
    this.container = container;
    this.onPieceSelect = onPieceSelect;
    this.onPieceMove = onPieceMove;
    this.onPieceSnap = onPieceSnap;
    this.meshes = new Map();
    this.selectedPieceId = null;
    this.isDragging = false;
    this.draggedPiece = null;
    this.dragPlane = new THREE.Plane();
    this.dragIntersection = new THREE.Vector3();
    this.originalImageMesh = null;
    this.init();
  }

  init() {
    // Scene setup
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xf0f0f0);

    // Camera setup
    this.camera = new THREE.PerspectiveCamera(
      75,
      window.innerWidth / window.innerHeight,
      0.1,
      1000
    );
    this.camera.position.set(10, 10, 10);
    this.camera.lookAt(0, 0, 0);

    // Renderer setup
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.container.appendChild(this.renderer.domElement);

    // Controls
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;
    this.controls.rotateSpeed = 0.5;
    this.controls.zoomSpeed = 1.2;
    this.controls.panSpeed = 0.8;
    this.controls.maxDistance = 50;
    this.controls.minDistance = 5;

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
    this.scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 1.0);
    directionalLight.position.set(10, 10, 10);
    directionalLight.castShadow = true;
    directionalLight.shadow.mapSize.width = 2048;
    directionalLight.shadow.mapSize.height = 2048;
    directionalLight.shadow.camera.near = 0.5;
    directionalLight.shadow.camera.far = 500;
    this.scene.add(directionalLight);

    // Grid helper
    const gridHelper = new THREE.GridHelper(20, 20, 0x888888, 0x444444);
    gridHelper.position.y = -5;
    this.scene.add(gridHelper);

    // Piece group
    this.pieceGroup = new THREE.Group();
    this.scene.add(this.pieceGroup);

    // Raycaster setup
    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();

    // Setup event listeners
    this.setupEventListeners();

    // Start animation loop
    this.animate();
  }

  setupEventListeners() {
    const handleResize = () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    };

    const handleMouseMove = (event) => {
      event.preventDefault();
      
      const rect = this.renderer.domElement.getBoundingClientRect();
      this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

      if (this.isDragging && this.draggedPiece) {
        this.handleDragMove(event);
      }
    };

    const handleMouseDown = (event) => {
      event.preventDefault();
      this.handleDragStart(event);
    };

    const handleMouseUp = (event) => {
      event.preventDefault();
      this.handleDragEnd(event);
    };

    window.addEventListener('resize', handleResize);
    this.renderer.domElement.addEventListener('mousemove', handleMouseMove);
    this.renderer.domElement.addEventListener('mousedown', handleMouseDown);
    this.renderer.domElement.addEventListener('mouseup', handleMouseUp);

    // Store event listeners for cleanup
    this.eventListeners = {
      resize: handleResize,
      mousemove: handleMouseMove,
      mousedown: handleMouseDown,
      mouseup: handleMouseUp
    };
  }

  createPiece(pieceData, texture, dimensions, difficulty) {
    const { width, height, depth } = dimensions;
    const pieceWidth = width / difficulty;
    const pieceHeight = height / difficulty;
    const pieceDepth = depth;

    // Create geometry
    const geometry = new THREE.BoxGeometry(pieceWidth, pieceHeight, pieceDepth);

    // Calculate UV mapping for this specific piece
    const uvs = geometry.attributes.uv;
    const { x, y } = pieceData.correct;

    for (let i = 0; i < uvs.count; i++) {
      const u = uvs.getX(i);
      const v = uvs.getY(i);
      
      uvs.setXY(
        i,
        (x + u) / difficulty,
        (y + v) / difficulty
      );
    }

    // Create materials
    const materials = Array(6).fill(null).map(() => 
      new THREE.MeshPhongMaterial({
        map: texture,
        color: 0xffffff,
        transparent: true,
        shadowSide: THREE.FrontSide
      })
    );

    const mesh = new THREE.Mesh(geometry, materials);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData.pieceId = pieceData.id;
    mesh.userData.correctPosition = {
      x: (pieceData.correct.x - difficulty/2) * pieceWidth * 1.2,
      y: (pieceData.correct.y - difficulty/2) * pieceHeight * 1.2,
      z: 0
    };

    // Random initial position in a sphere
    const radius = Math.max(width, height) * 2;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos((Math.random() * 2) - 1);
    
    const randomPosition = {
      x: radius * Math.sin(phi) * Math.cos(theta),
      y: radius * Math.sin(phi) * Math.sin(theta),
      z: radius * Math.cos(phi)
    };

    mesh.position.set(randomPosition.x, randomPosition.y, randomPosition.z);
    mesh.rotation.set(
      Math.random() * Math.PI * 2,
      Math.random() * Math.PI * 2,
      Math.random() * Math.PI * 2
    );

    this.meshes.set(pieceData.id, mesh);
    this.pieceGroup.add(mesh);

    // Add highlight effect
    const highlightMaterial = new THREE.MeshBasicMaterial({
      color: 0xffff00,
      transparent: true,
      opacity: 0,
      side: THREE.BackSide
    });
    const highlightMesh = new THREE.Mesh(
      geometry.clone().scale(1.05, 1.05, 1.05),
      highlightMaterial
    );
    mesh.add(highlightMesh);
    mesh.userData.highlightMesh = highlightMesh;

    return mesh;
  }

  handleDragStart(event) {
    this.raycaster.setFromCamera(this.mouse, this.camera);
    const intersects = this.raycaster.intersectObjects(this.pieceGroup.children);

    if (intersects.length > 0) {
      this.controls.enabled = false;
      this.isDragging = true;
      this.draggedPiece = intersects[0].object;
      
      // Create drag plane perpendicular to camera
      const normal = this.camera.getWorldDirection(new THREE.Vector3());
      const point = this.draggedPiece.position;
      this.dragPlane.setFromNormalAndCoplanarPoint(normal, point);
      
      // Highlight selected piece
      this.highlightPiece(this.draggedPiece);
      
      if (this.onPieceSelect) {
        this.onPieceSelect(this.draggedPiece.userData.pieceId);
      }
    }
  }

  handleDragMove(event) {
    if (!this.isDragging || !this.draggedPiece) return;

    this.raycaster.setFromCamera(this.mouse, this.camera);
    
    if (this.raycaster.ray.intersectPlane(this.dragPlane, this.dragIntersection)) {
      this.draggedPiece.position.copy(this.dragIntersection);
      
      // Check proximity to correct position for snapping
      const correctPos = this.draggedPiece.userData.correctPosition;
      const distance = this.draggedPiece.position.distanceTo(
        new THREE.Vector3(correctPos.x, correctPos.y, correctPos.z)
      );

      // Show snap preview if close
      if (distance < 1.5) {
        this.draggedPiece.userData.highlightMesh.material.opacity = 0.3;
      } else {
        this.draggedPiece.userData.highlightMesh.material.opacity = 0;
      }

      if (this.onPieceMove) {
        this.onPieceMove(
          this.draggedPiece.userData.pieceId,
          {
            x: this.dragIntersection.x,
            y: this.dragIntersection.y,
            z: this.dragIntersection.z
          }
        );
      }
    }
  }

  handleDragEnd() {
    if (this.isDragging && this.draggedPiece) {
      const correctPos = this.draggedPiece.userData.correctPosition;
      const distance = this.draggedPiece.position.distanceTo(
        new THREE.Vector3(correctPos.x, correctPos.y, correctPos.z)
      );

      // Snap if close enough
      if (distance < 1.5) {
        this.draggedPiece.position.set(correctPos.x, correctPos.y, correctPos.z);
        this.draggedPiece.rotation.set(0, 0, 0);
        
        if (this.onPieceSnap) {
          this.onPieceSnap(this.draggedPiece.userData.pieceId, correctPos);
        }
      }

      // Remove highlight
      this.draggedPiece.userData.highlightMesh.material.opacity = 0;
    }

    this.controls.enabled = true;
    this.isDragging = false;
    this.draggedPiece = null;
  }

  highlightPiece(piece) {
    this.meshes.forEach(mesh => {
      if (mesh.userData.highlightMesh) {
        mesh.userData.highlightMesh.material.opacity = 0;
      }
    });

    if (piece && piece.userData.highlightMesh) {
      piece.userData.highlightMesh.material.opacity = 0.3;
    }
  }

  updatePieces(piecesData, dimensions) {
    piecesData.forEach(pieceData => {
      const mesh = this.meshes.get(pieceData.id);
      if (mesh) {
        this.updatePiecePosition(mesh, pieceData);
      }
    });
  }

  updatePiecePosition(mesh, pieceData) {
    if (pieceData.isPlaced) {
      mesh.position.copy(mesh.userData.correctPosition);
      mesh.rotation.set(0, 0, 0);
    } else {
      mesh.position.set(
        pieceData.current.x,
        pieceData.current.y,
        pieceData.current.z
      );
      mesh.rotation.set(
        pieceData.rotation.x,
        pieceData.rotation.y,
        pieceData.rotation.z
      );
    }
  }

  animate = () => {
    this.animationFrame = requestAnimationFrame(this.animate);
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  };

  cleanup() {
    if (this.animationFrame) {
      cancelAnimationFrame(this.animationFrame);
    }

    // Remove event listeners
    window.removeEventListener('resize', this.eventListeners.resize);
    this.renderer.domElement.removeEventListener('mousemove', this.eventListeners.mousemove);
    this.renderer.domElement.removeEventListener('mousedown', this.eventListeners.mousedown);
    this.renderer.domElement.removeEventListener('mouseup', this.eventListeners.mouseup);

    if (this.renderer && this.container) {
      this.container.removeChild(this.renderer.domElement);
    }

    this.scene.clear();
    this.meshes.clear();
  }
}

const MultiplayerPuzzle3D = ({ puzzleId, gameId, isHost }) => {
  const userData = JSON.parse(localStorage.getItem('authUser'));
  const userId = userData.uid;
  const userName = userData.displayName || userData.email;

  const [gameState, setGameState] = useState({
    gameId: gameId || window.location.pathname.split('/').pop() || `game-${Date.now()}`,
    imageUrl: '',
    isHost: isHost || false,
    difficulty: 3,
    timer: 0,
    startTime: null,
    lastUpdateTime: null,
    dimensions: {
      width: 1,
      height: 1,
      depth: 0.1
    }
  });

  const [pieces, setPieces] = useState([]);
  const [players, setPlayers] = useState({});
  const [isGameStarted, setIsGameStarted] = useState(false);
  const [winner, setWinner] = useState(null);
  const [showShareModal, setShowShareModal] = useState(false);
  const [ui, setUi] = useState({
    selectedPieceId: null,
    error: null,
    showPlayers: true,
    loading: false
  });

  const mountRef = useRef(null);
  const threeManagerRef = useRef(null);
  const storage = getStorage();
  const database = getDatabase();
  const navigate = useNavigate();
  const timerRef = useRef(null);

  // Initialize Three.js
  useEffect(() => {
    if (!mountRef.current) return;

    threeManagerRef.current = new ThreeJSManager(
      mountRef.current,
      (pieceId) => setUi(prev => ({ ...prev, selectedPieceId: pieceId }))
    );

    return () => {
      if (threeManagerRef.current) {
        threeManagerRef.current.cleanup();
      }
    };
  }, []);

  // Firebase listeners
  useEffect(() => {
    const gameRef = dbRef(database, `games/${gameState.gameId}`);
    
    const handleGameUpdate = (snapshot) => {
      const data = snapshot.val();
      if (!data) {
        setUi(prev => ({ ...prev, loading: false }));
        return;
      }

      setGameState(prev => ({
        ...prev,
        imageUrl: data.imageUrl || '',
        difficulty: data.difficulty || 3,
        timer: data.timer || 0,
        startTime: data.startTime || null,
        dimensions: data.dimensions || prev.dimensions
      }));
      
      setPlayers(data.players || {});
      setPieces(data.pieces || []);
      setIsGameStarted(data.isGameStarted || false);

      if (data.winner) {
        setWinner(data.winner);
      }

      // Update Three.js pieces
      if (threeManagerRef.current && data.pieces) {
        threeManagerRef.current.updatePieces(data.pieces, data.dimensions);
      }
    };

    const unsubscribe = onValue(gameRef, handleGameUpdate);

    return () => {
      unsubscribe();
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [gameState.gameId]);

  // Timer management
  useEffect(() => {
    if (isGameStarted && !gameState.isCompleted) {
      timerRef.current = setInterval(async () => {
        const newTime = Math.floor((Date.now() - gameState.startTime) / 1000);
        const updates = {
          [`games/${gameState.gameId}/timer`]: newTime
        };
        await update(dbRef(database), updates);
      }, 1000);
    }

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [isGameStarted, gameState.isCompleted, gameState.startTime]);

  const createPuzzlePieces = async (texture) => {
    const { difficulty, dimensions } = gameState;
    const pieces = [];
  
    // Create base piece positions
    for (let i = 0; i < difficulty; i++) {
      for (let j = 0; j < difficulty; j++) {
        for (let k = 0; k < difficulty; k++) {
          const pieceData = {
            id: `piece-${i}-${j}-${k}`,
            correct: { x: i, y: j, z: k },
            current: { 
              x: (Math.random() - 0.5) * 20,
              y: (Math.random() - 0.5) * 20,
              z: (Math.random() - 0.5) * 20
            },
            rotation: {
              x: Math.random() * Math.PI * 2,
              y: Math.random() * Math.PI * 2,
              z: Math.random() * Math.PI * 2
            },
            isPlaced: false
          };
          pieces.push(pieceData);
  
          if (threeManagerRef.current) {
            threeManagerRef.current.createPiece(
              pieceData,
              texture,
              dimensions,
              difficulty
            );
          }
        }
      }
    }
  
    return pieces;
  };

  const shufflePieces = (pieces) => {
    const { difficulty } = gameState;
    const spread = difficulty/10; 
  
    return pieces.map(piece => {
      const randomPosition = {
        x: (Math.random() - 0.5) * spread,
        y: (Math.random() - 0.5) * spread,
        z: (Math.random() - 0.5) * spread
      };
      return {
        ...piece,
        current: randomPosition,
        rotation: {
          x: Math.random() * Math.PI * 2,
          y: Math.random() * Math.PI * 2,
          z: Math.random() * Math.PI * 2
        },
        isPlaced: false
      };
    });
  };

  const handleImageUpload = async (event) => {
    if (!gameState.isHost) return;
    
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      setUi(prev => ({ ...prev, loading: true }));
      const imageRef = storageRef(storage, `puzzle-images/${gameState.gameId}/${file.name}`);
      const snapshot = await uploadBytes(imageRef, file);
      const url = await getDownloadURL(snapshot.ref);
      
      const img = new Image();
      img.onload = async () => {
        try {
          const maxSize = 500; // Max size for either dimension
          const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
          
          const dimensions = {
            width: img.width * scale,
            height: img.height * scale,
            depth: Math.min(img.width, img.height) * scale * 0.1
          };

          const updates = {
            [`games/${gameState.gameId}/imageUrl`]: url,
            [`games/${gameState.gameId}/dimensions`]: dimensions
          };
          
          await update(dbRef(database), updates);
          setGameState(prev => ({ ...prev, dimensions }));
          setUi(prev => ({ ...prev, loading: false }));
        } catch (err) {
          throw new Error('Failed to update game with image information');
        }
      };
      
      img.onerror = () => {
        throw new Error('Failed to load image');
      };
      
      img.src = url;
    } catch (err) {
      console.error('Image upload error:', err);
      setUi(prev => ({
        ...prev,
        error: { type: 'error', message: 'Failed to upload image' },
        loading: false
      }));
    }
  };

  const initializePuzzle = async () => {
    if (!gameState.imageUrl || !gameState.isHost) return;

    try {
      setUi(prev => ({ ...prev, loading: true }));

      // Load texture
      const textureLoader = new THREE.TextureLoader();
      const texture = await new Promise((resolve, reject) => {
        textureLoader.load(gameState.imageUrl, resolve, undefined, reject);
      });

      // Create and shuffle pieces
      const newPieces = await createPuzzlePieces(texture);
      const shuffledPieces = shufflePieces(newPieces);

      // Update Firebase with only the necessary piece data
      const piecesData = shuffledPieces.map(({ id, correct, current, rotation, isPlaced }) => ({
        id, correct, current, rotation, isPlaced
      }));

      const updates = {
        [`games/${gameState.gameId}/pieces`]: piecesData,
        [`games/${gameState.gameId}/isGameStarted`]: true,
        [`games/${gameState.gameId}/startTime`]: Date.now(),
        [`games/${gameState.gameId}/timer`]: 0,
        [`games/${gameState.gameId}/isCompleted`]: false
      };

      await update(dbRef(database), updates);
      setUi(prev => ({ ...prev, loading: false }));
    } catch (err) {
      console.error('Failed to initialize puzzle:', err);
      setUi(prev => ({
        ...prev,
        loading: false,
        error: { type: 'error', message: 'Failed to start game' }
      }));
    }
  };

  const handleRotate = async (axis, direction) => {
    if (!ui.selectedPieceId) return;

    try {
      const rotationAmount = direction === 'left' ? -Math.PI / 2 : Math.PI / 2;
      const updatedPieces = pieces.map(piece => {
        if (piece.id === ui.selectedPieceId) {
          const newRotation = { ...piece.rotation };
          newRotation[axis] += rotationAmount;

          // Check if piece is in correct position and orientation
          const isCorrect = 
            Math.abs(piece.current.x - piece.correct.x) < 0.1 &&
            Math.abs(piece.current.y - piece.correct.y) < 0.1 &&
            Math.abs(piece.current.z - piece.correct.z) < 0.1 &&
            Math.abs(newRotation.x % (Math.PI * 2)) < 0.1 &&
            Math.abs(newRotation.y % (Math.PI * 2)) < 0.1 &&
            Math.abs(newRotation.z % (Math.PI * 2)) < 0.1;

          return { ...piece, rotation: newRotation, isPlaced: isCorrect };
        }
        return piece;
      });

      // Update Firebase with only the necessary piece data
      const piecesData = updatedPieces.map(({ id, correct, current, rotation, isPlaced }) => ({
        id, correct, current, rotation, isPlaced
      }));

      await update(dbRef(database, `games/${gameState.gameId}/pieces`), piecesData);

      // Check if puzzle is complete
      if (updatedPieces.every(p => p.isPlaced)) {
        handlePuzzleComplete();
      }
    } catch (err) {
      console.error('Failed to rotate piece:', err);
      setUi(prev => ({
        ...prev,
        error: { type: 'error', message: 'Failed to rotate piece' }
      }));
    }
  };

  const handlePuzzleComplete = async () => {
    try {
      const completionTime = Date.now() - gameState.startTime;
      const winner = {
        id: userId,
        name: userName,
        score: (players[userId]?.score || 0) + 1
      };

      await update(dbRef(database, `games/${gameState.gameId}`), {
        isCompleted: true,
        completionTime,
        winner
      });

      await handlePuzzleCompletion({
        puzzleId: gameState.gameId,
        userId,
        playerName: userName,
        startTime: gameState.startTime,
        completionTime,
        difficulty: gameState.difficulty
      });

      setWinner(winner);
      setShowShareModal(true);
    } catch (err) {
      console.error('Failed to handle puzzle completion:', err);
      setUi(prev => ({
        ...prev,
        error: { type: 'error', message: 'Failed to record completion' }
      }));
    }
  };

  const leaveGame = async () => {
    try {
      const updates = {};
      updates[`games/${gameState.gameId}/players/${userId}`] = null;
      await update(dbRef(database), updates);
      navigate('/');
    } catch (err) {
      console.error('Failed to leave game:', err);
      setUi(prev => ({
        ...prev,
        error: { type: 'error', message: 'Failed to leave game' }
      }));
    }
  };

  const handleDifficultyChange = async (event) => {
    if (!gameState.isHost) return;
    
    const newDifficulty = parseInt(event.target.value, 10);
    try {
      await update(dbRef(database, `games/${gameState.gameId}/difficulty`), newDifficulty);
      setGameState(prev => ({ ...prev, difficulty: newDifficulty }));
    } catch (err) {
      console.error('Failed to update difficulty:', err);
      setUi(prev => ({
        ...prev,
        error: { type: 'error', message: 'Failed to update difficulty' }
      }));
    }
  };

  const shareGameLink = async () => {
    const link = `${window.location.origin}/puzzle/multiplayer/${gameState.gameId}`;
    try {
      await navigator.clipboard.writeText(link);
      setUi(prev => ({
        ...prev,
        error: { type: 'success', message: 'Game link copied! Share with friends to play.' }
      }));
    } catch (err) {
      console.error('Failed to copy game link:', err);
      setUi(prev => ({
        ...prev,
        error: { type: 'error', message: 'Failed to copy game link' }
      }));
    }
  };

  // Render JSX
  return (
    <div className="w-full h-screen bg-white shadow-lg rounded-lg overflow-hidden">
      <div className="relative w-full h-full">
        {/* Controls */}
        <div className="absolute top-4 left-4 z-10 flex gap-2">
          <button
            onClick={() => navigate('/')}
            className="p-2 bg-white rounded-full shadow hover:bg-gray-100"
            title="Home"
          >
            <Home className="h-4 w-4" />
          </button>
          <button
            onClick={leaveGame}
            className="p-2 bg-white rounded-full shadow hover:bg-gray-100"
            title="Leave Game"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>

        {/* Timer */}
        <div className="absolute top-4 left-1/2 transform -translate-x-1/2 bg-white px-4 py-2 rounded-full shadow">
          <span className="font-medium">
            Time: {Math.floor(gameState.timer / 60)}:
            {String(gameState.timer % 60).padStart(2, '0')}
          </span>
        </div>

        {/* Game options */}
        <div className="absolute top-4 right-4 z-10 flex gap-2">
          {gameState.isHost && !isGameStarted && (
            <>
              <input
                type="file"
                accept="image/*"
                onChange={handleImageUpload}
                className="hidden"
                id="image-upload"
              />
              <label
                htmlFor="image-upload"
                className="p-2 bg-white rounded-full shadow hover:bg-gray-100 cursor-pointer"
              >
                <CameraIcon className="h-4 w-4" />
              </label>
              <input
                type="range"
                min="2"
                max="6"
                value={gameState.difficulty}
                onChange={handleDifficultyChange}
                className="w-32"
              />
              {gameState.imageUrl && (
                <button
                  onClick={initializePuzzle}
                  className="p-2 bg-white rounded-full shadow hover:bg-gray-100"
                  title="Start Game"
                >
                  <Play className="h-4 w-4" />
                </button>
              )}
            </>
          )}
          <button
            onClick={() => setUi(prev => ({ ...prev, showPlayers: !prev.showPlayers }))}
            className="p-2 bg-white rounded-full shadow hover:bg-gray-100"
            title="Toggle Players"
          >
            <Users className="h-4 w-4" />
          </button>
          <button
            onClick={shareGameLink}
            className="p-2 bg-white rounded-full shadow hover:bg-gray-100"
            title="Share Game"
          >
            <Share2 className="h-4 w-4" />
          </button>
        </div>

        {gameState.imageUrl && (
        <div className="absolute top-16 right-4 z-10 bg-white p-2 rounded-lg shadow-lg">
          <h4 className="text-sm font-semibold mb-2">Target Image</h4>
          <img 
            src={gameState.imageUrl} 
            alt="Target puzzle" 
            className="w-32 h-32 object-contain"
          />
        </div>
      )}

        {/* 3D Canvas */}
        <div ref={mountRef} className="w-full h-full" />

        {/* Piece rotation controls */}
        {ui.selectedPieceId && (
          <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 flex gap-2">
            {['x', 'y', 'z'].map(axis => (
              <div key={axis} className="flex gap-1">
                <button
                  onClick={() => handleRotate(axis, 'left')}
                  className="p-2 bg-white rounded-full shadow hover:bg-gray-100"
                  title={`Rotate ${axis.toUpperCase()} Left`}
                >
                  <RotateCcw className="h-4 w-4" />
                </button>
                <button
                  onClick={() => handleRotate(axis, 'right')}
                  className="p-2 bg-white rounded-full shadow hover:bg-gray-100"
                  title={`Rotate ${axis.toUpperCase()} Right`}
                >
                  <RotateCw className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Players list */}
        {ui.showPlayers && (
          <div className="absolute right-4 top-16 bg-white p-4 rounded-lg shadow-lg w-64">
            <h3 className="font-semibold mb-4">Players</h3>
            <div className="space-y-2">
            {Object.values(players).map(player => (
              console.log(player),
                <div 
                  key={player.id}
                  className="flex items-center gap-2 p-2 bg-gray-50 rounded"
                >
                  <div 
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: player.color }}
                  />
                  <span>{player.name}</span>
                  <span className="ml-auto">{player.score || 0}</span>
                  {player.isHost && (
                    <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">
                      Host
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Loading indicator */}
        {ui.loading && (
          <div className="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center">
            <div className="bg-white p-4 rounded-lg">Loading...</div>
          </div>
        )}

        {/* Error messages */}
        {ui.error && (
          <div 
            className={`absolute top-4 left-1/2 transform -translate-x-1/2 p-3 rounded ${
              ui.error.type === 'error' ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'
            }`}
          >
            {ui.error.message}
          </div>
        )}

        {/* Winner notification */}
        {winner && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white p-6 rounded-lg shadow-xl max-w-md w-full">
              <h3 className="text-xl font-bold mb-4">🎉 Puzzle Completed!</h3>
              <p className="text-lg mb-4">
                Winner: <span className="font-bold">{winner.name}</span>
              </p>
              <p className="mb-4">Score: {winner.score}</p>
              <p className="mb-4">
                Time: {Math.floor(gameState.timer / 60)}:
                {String(gameState.timer % 60).padStart(2, '0')}
              </p>
              <button
                onClick={() => setWinner(null)}
                className="w-full p-2 bg-blue-500 text-white rounded hover:bg-blue-600"
              >
                Close
              </button>
            </div>
          </div>
        )}

        {/* Share modal */}
        {showShareModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white p-6 rounded-lg shadow-xl max-w-md w-full">
              <h3 className="text-xl font-bold mb-4">Share Your Achievement</h3>
              <div className="space-y-4">
                <button
                  onClick={() => {
                    const url = encodeURIComponent(`${window.location.origin}/puzzle/multiplayer/${gameState.gameId}`);
                    const text = encodeURIComponent(
                      `I just completed a ${gameState.difficulty}x${gameState.difficulty}x${gameState.difficulty} 3D puzzle!`
                    );
                    window.open(`https://www.facebook.com/sharer/sharer.php?u=${url}&quote=${text}`, '_blank');
                  }}
                  className="w-full p-3 bg-blue-600 text-white rounded hover:bg-blue-700"
                >
                  Share on Facebook
                </button>
                <button
                  onClick={() => {
                    const url = encodeURIComponent(`${window.location.origin}/puzzle/multiplayer/${gameState.gameId}`);
                    const text = encodeURIComponent(
                      `I just completed a ${gameState.difficulty}x${gameState.difficulty}x${gameState.difficulty} 3D puzzle! #3DPuzzle`
                    );
                    window.open(`https://twitter.com/intent/tweet?url=${url}&text=${text}`, '_blank');
                  }}
                  className="w-full p-3 bg-sky-400 text-white rounded hover:bg-sky-500"
                >
                  Share on Twitter
                </button>
                <button
                  onClick={() => {
                    const url = encodeURIComponent(`${window.location.origin}/puzzle/multiplayer/${gameState.gameId}`);
                    const text = encodeURIComponent(
                      `I just completed a ${gameState.difficulty}x${gameState.difficulty}x${gameState.difficulty} 3D puzzle!`
                    );
                    window.open(`https://wa.me/?text=${text}%20${url}`, '_blank');
                  }}
                  className="w-full p-3 bg-green-500 text-white rounded hover:bg-green-600"
                >
                  Share on WhatsApp
                </button>
                <button
                  onClick={() => {
                    if (threeManagerRef.current) {
                      const canvas = threeManagerRef.current.renderer.domElement;
                      const link = document.createElement('a');
                      link.download = `3d-puzzle-${gameState.gameId}.png`;
                      link.href = canvas.toDataURL('image/png');
                      link.click();
                    }
                  }}
                  className="w-full p-3 bg-gray-200 text-gray-800 rounded hover:bg-gray-300 flex items-center justify-center gap-2"
                >
                  <Download className="h-4 w-4" /> Download Screenshot
                </button>
              </div>
              <button
                onClick={() => setShowShareModal(false)}
                className="mt-4 w-full p-2 border border-gray-300 rounded hover:bg-gray-50"
              >
                Close
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default MultiplayerPuzzle3D;