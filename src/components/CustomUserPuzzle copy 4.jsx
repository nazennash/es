// Part 1: Imports and Initial Setup
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { getStorage, ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import { getDatabase, ref as dbRef, set, update, get, onValue, off } from 'firebase/database';
import { 
    ZoomIn, ZoomOut, RotateCw, RotateCcw, Play, Home, LogOut, Share2, Download,
     Square 
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { handlePuzzleCompletion } from './PuzzleCompletionHandler';
import { Bar } from 'react-chartjs-2';
import 'chart.js/auto';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import html2canvas from 'html2canvas';
import Papa from 'papaparse';
import _ from 'lodash';

// Constants
const POSITION_TOLERANCE = 0.1;
const ROTATION_TOLERANCE = 0.1;
const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5MB
const DEFAULT_DIFFICULTY = 3;
const MIN_DIFFICULTY = 2;
const MAX_DIFFICULTY = 8;

// Part 2: Main Component and State Declarations
const CustomUserPuzzle = () => {
    // Main game state
    const [gameState, setGameState] = useState({
        gameId: `game-${Date.now()}`,
        imageUrl: '',
        difficulty: DEFAULT_DIFFICULTY,
        timer: 0,
        imageSize: { width: 0, height: 0 },
        startTime: null,
        isCompleted: false,
        mode: '2d'
    });

    // 3D specific state
    const [scene3D, setScene3D] = useState({
        camera: null,
        renderer: null,
        scene: null,
        controls: null,
        pieces: [],
        selectedPiece: null,
        hoveredPiece: null
    });

    // Game pieces state
    const [pieces, setPieces] = useState([]);
    const [isGameStarted, setIsGameStarted] = useState(false);
    const [showShareModal, setShowShareModal] = useState(false);

    // UI state
    const [ui, setUi] = useState({
        zoom: 1,
        selectedPiece: null,
        draggedPiece: null,
        error: null,
        loading: true,
        gridDimensions: { width: 0, height: 0 },
        cellDimensions: { width: 0, height: 0 },
        imageUploading: false
    });

    // Refs
    const mountRef = useRef(null);
    const rendererRef = useRef(null);
    const sceneRef = useRef(null);
    const cameraRef = useRef(null);
    const controlsRef = useRef(null);
    const animationFrameRef = useRef(null);
    const puzzleContainerRef = useRef(null);
    const timerRef = useRef(null);

    // Navigation and Firebase setup
    const navigate = useNavigate();
    const storage = getStorage();
    const database = getDatabase();
    const gameRef = useRef(dbRef(database, `games/${gameState.gameId}`));

    // User data initialization
    const userData = JSON.parse(localStorage.getItem('authUser'));
    const userId = userData?.uid;
    const userName = userData?.displayName || userData?.email;

    const user = {
        id: userId || `user-${Date.now()}`,
        name: userName || `Player ${Math.floor(Math.random() * 1000)}`
    };

    // Part 3: Firebase and User Setup
    useEffect(() => {
        const initializeGame = async () => {
            try {
                setUi(prev => ({ ...prev, loading: true }));
                
                const snapshot = await get(gameRef.current);
                if (!snapshot.exists()) {
                    await set(gameRef.current, {
                        imageUrl: '',
                        isGameStarted: false,
                        timer: 0,
                        difficulty: gameState.difficulty,
                        startTime: null,
                        isCompleted: false
                    });
                } else {
                    const data = snapshot.val();
                    setGameState(prev => ({ ...prev, ...data }));
                    if (data.pieces) setPieces(data.pieces);
                    if (data.isGameStarted) setIsGameStarted(true);
                }

                const unsubscribe = onValue(gameRef.current, (snapshot) => {
                    const data = snapshot.val();
                    if (data) {
                        setGameState(prev => ({ ...prev, ...data }));
                        if (data.pieces) setPieces(data.pieces);
                        if (data.isGameStarted !== isGameStarted) {
                            setIsGameStarted(data.isGameStarted);
                        }
                    }
                });

                setUi(prev => ({ ...prev, loading: false }));
                
                return () => {
                    unsubscribe();
                    off(gameRef.current);
                    if (timerRef.current) clearInterval(timerRef.current);
                };
            } catch (err) {
                console.error('Failed to initialize game:', err);
                setUi(prev => ({
                    ...prev,
                    loading: false,
                    error: { type: 'error', message: 'Failed to initialize game' }
                }));
            }
        };

        initializeGame();
    }, [gameState.gameId]);

    // Timer management
    useEffect(() => {
        let timerInterval;

        const updateTimer = async () => {
            if (!gameState.startTime || !isGameStarted || gameState.isCompleted) return;
            
            const newTimer = Math.floor((Date.now() - gameState.startTime) / 1000);
            
            try {
                await update(gameRef.current, { timer: newTimer });
                setGameState(prev => ({ ...prev, timer: newTimer }));
            } catch (err) {
                console.error('Failed to update timer:', err);
            }
        };

        if (isGameStarted && gameState.startTime && !gameState.isCompleted) {
            timerInterval = setInterval(updateTimer, 1000);
        }

        return () => {
            if (timerInterval) {
                clearInterval(timerInterval);
            }
        };
    }, [isGameStarted, gameState.startTime, gameState.isCompleted]);

    // Handle image upload
    const handleImageUpload = async (event) => {
        const file = event.target.files?.[0];
        if (!file) return;

        try {
            setUi(prev => ({ ...prev, loading: true, error: null, imageUploading: true }));
            
            if (file.size > MAX_IMAGE_SIZE) {
                throw new Error('Image must be smaller than 5MB');
            }
            
            if (!file.type.startsWith('image/')) {
                throw new Error('File must be an image');
            }

            const imageRef = storageRef(storage, `puzzle-images/${gameState.gameId}/${file.name}`);
            const snapshot = await uploadBytes(imageRef, file);
            const url = await getDownloadURL(snapshot.ref);
            
            return new Promise((resolve, reject) => {
                const img = new Image();
                img.onload = async () => {
                    try {
                        await update(gameRef.current, {
                            imageUrl: url,
                            imageSize: {
                                width: img.width,
                                height: img.height
                            }
                        });
                        
                        setGameState(prev => ({
                            ...prev,
                            imageUrl: url,
                            imageSize: { width: img.width, height: img.height }
                        }));
                        
                        setUi(prev => ({ ...prev, loading: false, imageUploading: false }));
                        resolve();
                    } catch (err) {
                        reject(new Error('Failed to update game with image information'));
                    }
                };
                
                img.onerror = () => reject(new Error('Failed to load image'));
                img.src = url;
            });
        } catch (err) {
            console.error('Image upload error:', err);
            setUi(prev => ({
                ...prev,
                error: { type: 'error', message: err.message || 'Failed to upload image' },
                loading: false,
                imageUploading: false
            }));
        }
    };

    // Part 4: 3D Setup Functions and Handlers will continue here...

// Part 4: 3D Setup Functions and Handlers
const init3DScene = useCallback(() => {
  if (!mountRef.current) return;

  // Scene setup
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xf0f0f0);

  // Camera setup
  const camera = new THREE.PerspectiveCamera(
      75,
      mountRef.current.clientWidth / mountRef.current.clientHeight,
      0.1,
      1000
  );
  camera.position.z = 5;

  // Renderer setup
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(mountRef.current.clientWidth, mountRef.current.clientHeight);
  renderer.shadowMap.enabled = true;
  mountRef.current.appendChild(renderer.domElement);

  // Lighting
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
  scene.add(ambientLight);

  const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
  directionalLight.position.set(10, 10, 10);
  directionalLight.castShadow = true;
  scene.add(directionalLight);

  // Controls
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;

  // Store refs
  sceneRef.current = scene;
  cameraRef.current = camera;
  rendererRef.current = renderer;
  controlsRef.current = controls;

  const animate = () => {
      animationFrameRef.current = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
  };
  animate();

  const handleResize = () => {
      if (!mountRef.current) return;
      const width = mountRef.current.clientWidth;
      const height = mountRef.current.clientHeight;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
  };

  window.addEventListener('resize', handleResize);

  return () => {
      window.removeEventListener('resize', handleResize);
      if (animationFrameRef.current) {
          cancelAnimationFrame(animationFrameRef.current);
      }
      if (mountRef.current && renderer.domElement) {
          mountRef.current.removeChild(renderer.domElement);
      }
      renderer.dispose();
  };
}, []);

// lost part
const initializePuzzle = async () => {
  if (!gameState.imageUrl) return;

  try {
      setUi(prev => ({ ...prev, loading: true, error: null }));
      
      // Generate random pieces
      const newPieces = Array.from(
          { length: gameState.difficulty * gameState.difficulty },
          (_, index) => {
              const correctX = Math.floor(index / gameState.difficulty);
              const correctY = index % gameState.difficulty;
              // Random initial position
              const randomPosition = Math.floor(Math.random() * (gameState.difficulty * gameState.difficulty));
              const currentX = Math.floor(randomPosition / gameState.difficulty);
              const currentY = randomPosition % gameState.difficulty;
              
              return {
                  id: `piece-${correctX}-${correctY}`,
                  correct: { x: correctX, y: correctY },
                  current: { x: currentX, y: currentY },
                  rotation: Math.floor(Math.random() * 4) * 90, // Random rotation in 90-degree increments
                  isPlaced: false
              };
          }
      );

      // Shuffle pieces
      for (let i = newPieces.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          const temp = newPieces[i].current;
          newPieces[i].current = newPieces[j].current;
          newPieces[j].current = temp;
      }
      
      const startTime = Date.now();
      const updates = {
          pieces: newPieces,
          isGameStarted: true,
          startTime,
          timer: 0,
          isCompleted: false
      };
      
      await update(gameRef.current, updates);
      
      setPieces(newPieces);
      setGameState(prev => ({
          ...prev,
          startTime,
          timer: 0,
          isCompleted: false
      }));
      setIsGameStarted(true);
      
  } catch (err) {
      console.error('Failed to initialize puzzle:', err);
      setUi(prev => ({
          ...prev,
          error: { type: 'error', message: 'Failed to start game' }
      }));
  } finally {
      setUi(prev => ({ ...prev, loading: false }));
  }
};

// Handle difficulty change
const handleDifficultyChange = async (event) => {
  const newDifficulty = parseInt(event.target.value, 10);
  try {
      await update(gameRef.current, { difficulty: newDifficulty });
      setGameState(prev => ({ ...prev, difficulty: newDifficulty }));
      
      if (!isGameStarted) {
          await update(gameRef.current, { pieces: [] });
          setPieces([]);
      }
  } catch (err) {
      console.error('Failed to update difficulty:', err);
      setUi(prev => ({
          ...prev,
          error: { type: 'error', message: 'Failed to update difficulty' }
      }));
  }
};

// Handle piece rotation
const handleRotate = async (direction) => {
  if (!ui.selectedPiece) return;

  try {
      const updatedPieces = pieces.map(p => {
          if (p.id === ui.selectedPiece.id) {
              const newRotation = p.rotation + (direction === 'left' ? -90 : 90);
              const isCorrect = p.correct.x === p.current.x && 
                              p.correct.y === p.current.y && 
                              newRotation % 360 === 0;
              
              return { ...p, rotation: newRotation, isPlaced: isCorrect };
          }
          return p;
      });

      await update(gameRef.current, { pieces: updatedPieces });
      setPieces(updatedPieces);
  } catch (err) {
      console.error('Failed to rotate piece:', err);
      setUi(prev => ({
          ...prev,
          error: { type: 'error', message: 'Failed to rotate piece' }
      }));
  }
};

// Handle piece drop
const handleDrop = async (x, y) => {
  if (!ui.draggedPiece) return;
  
  try {
      const targetPiece = pieces.find(p => p.current.x === x && p.current.y === y);
      
      const updatedPieces = pieces.map(p => {
          if (p.id === ui.draggedPiece.id) {
              const isCorrect = x === p.correct.x && 
                              y === p.correct.y && 
                              p.rotation % 360 === 0;
              return { ...p, current: { x, y }, isPlaced: isCorrect };
          }
          
          if (targetPiece && p.id === targetPiece.id) {
              return { 
                  ...p, 
                  current: { 
                      x: ui.draggedPiece.current.x, 
                      y: ui.draggedPiece.current.y 
                  }
              };
          }
          
          return p;
      });

      await update(gameRef.current, { pieces: updatedPieces });
      setPieces(updatedPieces);
      setUi(prev => ({ ...prev, draggedPiece: null }));
  } catch (err) {
      console.error('Failed to update piece position:', err);
      setUi(prev => ({
          ...prev,
          error: { type: 'error', message: 'Failed to move piece' },
          draggedPiece: null
      }));
  }
};


const check3DPiecePlacement = useCallback((piece) => {
  if (!piece.userData?.correctPosition) return false;

  const isPositionCorrect = 
      Math.abs(piece.position.x - piece.userData.correctPosition.x) < POSITION_TOLERANCE &&
      Math.abs(piece.position.y - piece.userData.correctPosition.y) < POSITION_TOLERANCE &&
      Math.abs(piece.position.z - piece.userData.correctPosition.z) < POSITION_TOLERANCE;

  const isRotationCorrect = 
      Math.abs(piece.rotation.x % (Math.PI * 2)) < ROTATION_TOLERANCE &&
      Math.abs(piece.rotation.y % (Math.PI * 2)) < ROTATION_TOLERANCE &&
      Math.abs(piece.rotation.z % (Math.PI * 2)) < ROTATION_TOLERANCE;

  const isCorrect = isPositionCorrect && isRotationCorrect;

  if (isCorrect !== piece.userData.isPlaced) {
      piece.userData.isPlaced = isCorrect;
      if (isCorrect) {
          piece.position.copy(piece.userData.correctPosition);
          piece.rotation.set(0, 0, 0);
          const glowMaterial = new THREE.MeshPhongMaterial({
              emissive: new THREE.Color(0x00ff00),
              emissiveIntensity: 0.2
          });
          piece.material = glowMaterial;
      }
  }

  return isCorrect;
}, []);

// Calculate completion percentage
const calculateCompletionPercentage = () => {
  if (pieces.length === 0) return 0;
  const correctlyPlaced = pieces.filter(p => p.isPlaced).length;
  return (correctlyPlaced / pieces.length) * 100;
};

// Update piece placement in 3D
const updatePiecePlacement3D = useCallback((piece, position, rotation) => {
  if (!sceneRef.current) return;

  try {
      piece.position.copy(position);
      piece.rotation.copy(rotation);
      check3DPiecePlacement(piece);
  } catch (err) {
      console.error('Failed to update 3D piece placement:', err);
      setUi(prev => ({
          ...prev,
          error: { type: 'error', message: 'Failed to update piece position' }
      }));
  }
}, [check3DPiecePlacement]);

// Handle 3D piece selection
const handle3DPieceSelection = useCallback((piece) => {
  setScene3D(prev => ({
      ...prev,
      selectedPiece: prev.selectedPiece?.uuid === piece.uuid ? null : piece
  }));
}, []);

// Handle 3D piece movement
const handle3DPieceMovement = useCallback((event, piece) => {
  if (!scene3D.selectedPiece || scene3D.selectedPiece.uuid !== piece.uuid) return;

  const intersects = raycaster.intersectObjects(scene3D.pieces);
  if (intersects.length > 0) {
      const intersection = intersects[0];
      updatePiecePlacement3D(
          piece,
          intersection.point,
          piece.rotation
      );
  }
}, [scene3D.selectedPiece, scene3D.pieces, updatePiecePlacement3D]);

// Screenshot capture
const capturePuzzleImage = async () => {
  if (!puzzleContainerRef.current) return null;
  try {
      const canvas = await html2canvas(puzzleContainerRef.current);
      return canvas.toDataURL('image/png');
  } catch (err) {
      console.error('Failed to capture puzzle image:', err);
      setUi(prev => ({
          ...prev,
          error: { type: 'error', message: 'Failed to capture puzzle image' }
      }));
      return null;
  }
};

// Social share functions
const shareToFacebook = () => {
  const url = encodeURIComponent(window.location.href);
  const text = encodeURIComponent(
      `I completed a ${gameState.difficulty}x${gameState.difficulty} puzzle in ${Math.floor(gameState.timer / 60)}:${String(gameState.timer % 60).padStart(2, '0')}!`
  );
  window.open(`https://www.facebook.com/sharer/sharer.php?u=${url}&quote=${text}`, '_blank');
};

const shareToTwitter = () => {
  const url = encodeURIComponent(window.location.href);
  const text = encodeURIComponent(
      `I completed a ${gameState.difficulty}x${gameState.difficulty} puzzle in ${Math.floor(gameState.timer / 60)}:${String(gameState.timer % 60).padStart(2, '0')}! #PuzzleGame`
  );
  window.open(`https://twitter.com/intent/tweet?url=${url}&text=${text}`, '_blank');
};

const downloadPuzzleImage = async () => {
  const imageData = await capturePuzzleImage();
  if (!imageData) return;

  const link = document.createElement('a');
  link.href = imageData;
  link.download = `puzzle-${gameState.gameId}.png`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

// Part 5: Game Logic and Event Handlers
const create3DPieces = useCallback((imageUrl, difficulty) => {
  if (!sceneRef.current) return;

  // Clear existing pieces
  sceneRef.current.children
      .filter(child => child.userData.isPuzzlePiece)
      .forEach(piece => sceneRef.current.remove(piece));

  const textureLoader = new THREE.TextureLoader();
  textureLoader.load(imageUrl, (texture) => {
      const pieceGeometry = new THREE.BoxGeometry(1, 1, 0.1);
      const pieceMaterial = new THREE.MeshPhongMaterial({
          map: texture,
          shininess: 50
      });

      const pieces = [];
      const totalPieces = difficulty * difficulty;
      const pieceWidth = 1 / difficulty;
      const pieceHeight = 1 / difficulty;

      for (let i = 0; i < difficulty; i++) {
          for (let j = 0; j < difficulty; j++) {
              const piece = new THREE.Mesh(pieceGeometry, pieceMaterial.clone());
              
              piece.userData = {
                  isPuzzlePiece: true,
                  correctPosition: new THREE.Vector3(
                      (i - difficulty/2 + 0.5) * pieceWidth * 2,
                      (j - difficulty/2 + 0.5) * pieceHeight * 2,
                      0
                  ),
                  isPlaced: false,
                  id: `piece-${i}-${j}`
              };

              // Random initial position
              piece.position.set(
                  (Math.random() - 0.5) * 4,
                  (Math.random() - 0.5) * 4,
                  0
              );

              // UV mapping for texture
              const uvAttribute = piece.geometry.attributes.uv;
              for (let k = 0; k < uvAttribute.count; k++) {
                  uvAttribute.setXY(
                      k,
                      (i + uvAttribute.getX(k)) / difficulty,
                      1 - ((j + uvAttribute.getY(k)) / difficulty)
                  );
              }

              sceneRef.current.add(piece);
              pieces.push(piece);
          }
      }

      setScene3D(prev => ({ ...prev, pieces }));
  });
}, []);

const handlePuzzleComplete = useCallback(async () => {
  if (!isGameStarted || gameState.isCompleted) return;

  try {
      const finalTime = Math.floor((Date.now() - gameState.startTime) / 1000);

      const updates = {
          isCompleted: true,
          isGameStarted: false,
          completionTime: finalTime,
          finalTimer: finalTime
      };

      await update(gameRef.current, updates);
      
      setGameState(prev => ({
          ...prev,
          ...updates,
          timer: finalTime
      }));
      
      setIsGameStarted(false);

      await handlePuzzleCompletion({
          puzzleId: gameState.gameId,
          startTime: gameState.startTime,
          timer: finalTime,
          difficulty: gameState.difficulty,
          imageUrl: gameState.imageUrl,
          userId: userId, 
          playerName: userName,
      });

      setShowShareModal(true);

  } catch (err) {
      console.error('Failed to handle puzzle completion:', err);
      setUi(prev => ({
          ...prev,
          error: { type: 'error', message: 'Failed to record puzzle completion' }
      }));
  }
}, [isGameStarted, gameState, userId, userName]);

// Part 6: Social Features and UI Components
const ShareModal = () => (
  <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white p-6 rounded-lg shadow-xl max-w-md w-full">
          <h3 className="text-xl font-bold mb-4">Share Your Achievement</h3>
          <div className="space-y-4">
              <button
                  onClick={() => {
                      const url = encodeURIComponent(window.location.href);
                      const text = encodeURIComponent(
                          `I completed a ${gameState.difficulty}x${gameState.difficulty} puzzle in ${Math.floor(gameState.timer / 60)}:${String(gameState.timer % 60).padStart(2, '0')}!`
                      );
                      window.open(`https://www.facebook.com/sharer/sharer.php?u=${url}&quote=${text}`, '_blank');
                  }}
                  className="w-full p-3 bg-blue-600 text-white rounded hover:bg-blue-700"
              >
                  Share on Facebook
              </button>
              <button
                  onClick={() => {
                      const url = encodeURIComponent(window.location.href);
                      const text = encodeURIComponent(
                          `I completed a ${gameState.difficulty}x${gameState.difficulty} puzzle in ${Math.floor(gameState.timer / 60)}:${String(gameState.timer % 60).padStart(2, '0')}! #PuzzleGame`
                      );
                      window.open(`https://twitter.com/intent/tweet?url=${url}&text=${text}`, '_blank');
                  }}
                  className="w-full p-3 bg-sky-400 text-white rounded hover:bg-sky-500"
              >
                  Share on Twitter
              </button>
              <button
                  onClick={async () => {
                      if (!puzzleContainerRef.current) return;
                      const canvas = await html2canvas(puzzleContainerRef.current);
                      const imageData = canvas.toDataURL('image/png');
                      const link = document.createElement('a');
                      link.href = imageData;
                      link.download = `puzzle-${gameState.gameId}.png`;
                      document.body.appendChild(link);
                      link.click();
                      document.body.removeChild(link);
                  }}
                  className="w-full p-3 bg-gray-200 text-gray-800 rounded hover:bg-gray-300 flex items-center justify-center gap-2"
              >
                  <Download className="h-4 w-4" /> Download Image
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
);

// Part 7: Component Render
if (ui.loading) {
  return (
      <div className="flex items-center justify-center h-screen">
          <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-gray-900"></div>
      </div>
  );
}

return (
  <div className="flex flex-col gap-4 p-4 bg-white rounded-lg shadow-lg max-w-6xl mx-auto">
      <div className="flex items-center justify-between border-b pb-4">
          <h1 className="text-2xl font-bold">Custom User Puzzle</h1>
          <div className="flex items-center gap-4">
              <p>Welcome {user.name}</p>
              <button
                  onClick={() => setGameState(prev => ({
                      ...prev,
                      mode: prev.mode === '2d' ? '3d' : '2d'
                  }))}
                  className="p-2 border rounded hover:bg-gray-100"
                  title={`Switch to ${gameState.mode === '2d' ? '3D' : '2D'} Mode`}
              >
                  {gameState.mode === '2d' ? <Share2 className="h-4 w-4" /> : <Square className="h-4 w-4" />}
              </button>
          </div>
          <div className="text-lg font-semibold">
              {`Time: ${String(Math.floor(gameState.timer / 60)).padStart(2, '0')}:${String(gameState.timer % 60).padStart(2, '0')}`}
          </div>
          <div className="flex gap-2">
              <button
                  onClick={() => navigate('/')}
                  className="p-2 border rounded hover:bg-gray-100 text-gray-600"
                  title="Return Home"
              >
                  <Home className="h-4 w-4" />
              </button>
              <button
                  onClick={() => navigate('/')}
                  className="p-2 border rounded hover:bg-red-50 text-red-600"
                  title="Leave Session"
              >
                  <LogOut className="h-4 w-4" />
              </button>
          </div>
      </div>

      {!gameState.imageUrl ? (
          <div className="w-full p-8 border-2 border-dashed rounded-lg text-center">
              <input
                  type="file"
                  accept="image/*"
                  onChange={handleImageUpload}
                  className="w-full"
              />
              <p className="mt-2 text-sm text-gray-500">
                  {ui.imageUploading ? 'Uploading image...' : 'Upload an image to start the game'}
              </p>
          </div>
      ) : gameState.mode === '2d' ? (
        <div className="flex-1">
            <div className="flex justify-end mb-4">
                <img 
                    src={gameState.imageUrl} 
                    alt="Expected output" 
                    className="w-1/6 h-1/6 object-cover rounded border" 
                />
            </div>
    
            <div className="flex gap-2 mb-4">
                <button
                    onClick={() => setUi(prev => ({ ...prev, zoom: Math.max(prev.zoom - 0.1, 0.5) }))}
                    className="p-2 border rounded hover:bg-gray-100"
                    title="Zoom Out"
                >
                    <ZoomOut className="h-4 w-4" />
                </button>
                <button
                    onClick={() => setUi(prev => ({ ...prev, zoom: Math.min(prev.zoom + 0.1, 2) }))}
                    className="p-2 border rounded hover:bg-gray-100"
                    title="Zoom In"
                >
                    <ZoomIn className="h-4 w-4" />
                </button>
                {ui.selectedPiece && (
                    <>
                        <button
                            onClick={() => handleRotate('left')}
                            className="p-2 border rounded hover:bg-gray-100"
                            title="Rotate Left"
                        >
                            <RotateCcw className="h-4 w-4" />
                        </button>
                        <button
                            onClick={() => handleRotate('right')}
                            className="p-2 border rounded hover:bg-gray-100"
                            title="Rotate Right"
                        >
                            <RotateCw className="h-4 w-4" />
                        </button>
                    </>
                )}
                {!isGameStarted && (
                    <button
                        onClick={initializePuzzle}
                        className="p-2 border rounded hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
                        disabled={!gameState.imageUrl}
                        title="Start Game"
                    >
                        <Play className="h-4 w-4" />
                    </button>
                )}
            </div>
    
            {!isGameStarted && (
                <div className="flex items-center gap-4 p-4 bg-gray-50 rounded-lg mb-4">
                    <label htmlFor="difficulty" className="font-medium">
                        Puzzle Size: {gameState.difficulty}x{gameState.difficulty}
                    </label>
                    <input
                        type="range"
                        id="difficulty"
                        min="2"
                        max="8"
                        value={gameState.difficulty}
                        onChange={handleDifficultyChange}
                        className="flex-1"
                    />
                    <span className="text-sm text-gray-600">
                        ({gameState.difficulty * gameState.difficulty} pieces)
                    </span>
                </div>
            )}
    
            {ui.error && (
                <div 
                    className={`p-3 rounded mb-4 ${
                        ui.error.type === 'error' ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'
                    }`}
                    role="alert"
                >
                    {ui.error.message}
                </div>
            )}
    
            <div 
                className="grid gap-1 transition-transform duration-200"
                style={{
                    gridTemplateColumns: `repeat(${gameState.difficulty}, 1fr)`,
                    transform: `scale(${ui.zoom})`,
                    transformOrigin: 'top left'
                }}
                ref={(el) => {
                    if (el && (ui.gridDimensions.width !== el.offsetWidth || ui.gridDimensions.height !== el.offsetHeight)) {
                        setUi(prev => ({ 
                            ...prev, 
                            gridDimensions: { width: el.offsetWidth, height: el.offsetHeight } 
                        }));
                    }
                }}
            >
                {Array.from({ length: gameState.difficulty * gameState.difficulty }).map((_, index) => {
                    const x = Math.floor(index / gameState.difficulty);
                    const y = index % gameState.difficulty;
                    
                    return (
                        <div
                            key={`cell-${x}-${y}`}
                            className="aspect-square bg-gray-100 rounded-lg relative"
                            onDragOver={(e) => e.preventDefault()}
                            onDrop={() => handleDrop(x, y)}
                            ref={(el) => {
                                if (el && (ui.cellDimensions.width !== el.offsetWidth || ui.cellDimensions.height !== el.offsetHeight)) {
                                    setUi(prev => ({
                                        ...prev,
                                        cellDimensions: { width: el.offsetWidth, height: el.offsetHeight }
                                    }));
                                }
                            }}
                        >
                            {pieces.map(piece => {
                                if (piece.current.x === x && piece.current.y === y) {
                                    const gridWidth = ui.gridDimensions?.width || 0;
                                    const gridHeight = ui.gridDimensions?.height || 0;
                                    const cellWidth = ui.cellDimensions?.width || 0;
                                    const cellHeight = ui.cellDimensions?.height || 0;
                                    const backgroundSize = `${gridWidth}px ${gridHeight}px`;
                                    const backgroundPosition = `${-piece.correct.y * cellWidth}px ${-piece.correct.x * cellHeight}px`;
    
                                    return (
                                        <div
                                            key={piece.id}
                                            draggable
                                            className={`absolute inset-0 rounded-lg cursor-move bg-cover
                                                ${piece.isPlaced ? 'ring-2 ring-green-500' : ''}
                                                ${ui.selectedPiece?.id === piece.id ? 'ring-2 ring-blue-500' : ''}`}
                                            style={{
                                                backgroundImage: `url(${gameState.imageUrl})`,
                                                backgroundSize,
                                                backgroundPosition,
                                                transform: `rotate(${piece.rotation}deg)`
                                            }}
                                            onDragStart={() => setUi(prev => ({ ...prev, draggedPiece: piece }))}
                                            onClick={() => setUi(prev => ({
                                                ...prev,
                                                selectedPiece: prev.selectedPiece?.id === piece.id ? null : piece
                                            }))}
                                        />
                                    );
                                }
                                return null;
                            })}
                        </div>
                    );
                })}
            </div>
    
            <div className="flex gap-4 text-sm mt-4">
                <div>Total Pieces: {pieces.length}</div>
                <div>Correctly Placed: {pieces.filter(p => p.isPlaced).length}</div>
                <div>Remaining: {pieces.length - pieces.filter(p => p.isPlaced).length}</div>
                <div>Completion: {calculateCompletionPercentage().toFixed(2)}%</div>
            </div>
    
            <div className="mt-4 h-32">
                <Bar 
                    data={{
                        labels: ['Progress'],
                        datasets: [{
                            label: 'Completion Percentage',
                            data: [calculateCompletionPercentage()],
                            backgroundColor: ['rgba(75, 192, 192, 0.6)'],
                            borderColor: ['rgba(75, 192, 192, 1)'],
                            borderWidth: 1,
                        }]
                    }} 
                    options={{ 
                        scales: { 
                            y: { 
                                beginAtZero: true, 
                                max: 100,
                                title: {
                                    display: true,
                                    text: 'Completion %'
                                }
                            } 
                        },
                        maintainAspectRatio: false
                    }} 
                />
            </div>
        </div>
    
      ) : (
          <div ref={mountRef} className="w-full aspect-video" />
      )}

      {showShareModal && <ShareModal />}
  </div>
);
};

export default CustomUserPuzzle;