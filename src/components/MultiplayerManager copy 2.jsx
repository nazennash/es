// MultiplayerPuzzle.jsx
import React, { useState, useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass';
import { Camera, Check, Info, Clock, ZoomIn, ZoomOut, Maximize2, RotateCcw, Image, Play, Pause, Users, Share2, LogOut, Home } from 'lucide-react';
import { getStorage, ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import { getDatabase, ref as dbRef, set, onValue, update, get, increment } from 'firebase/database';
import { useNavigate } from 'react-router-dom';

// Shader definitions
const puzzlePieceShader = {
  vertexShader: `
    varying vec2 vUv;
    varying vec3 vNormal;
    uniform vec2 uvOffset;
    uniform vec2 uvScale;
    
    void main() {
      vUv = uvOffset + uv * uvScale;
      vNormal = normalize(normalMatrix * normal);
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D map;
    uniform float selected;
    uniform float correctPosition;
    uniform float time;
    
    varying vec2 vUv;
    varying vec3 vNormal;
    
    void main() {
      vec4 texColor = texture2D(map, vUv);
      vec3 normal = normalize(vNormal);
      vec3 lightDir = normalize(vec3(5.0, 5.0, 5.0));
      float diff = max(dot(normal, lightDir), 0.0);
      
      vec3 highlightColor = vec3(0.3, 0.6, 1.0);
      float highlightStrength = selected * 0.5 * (0.5 + 0.5 * sin(time * 3.0));
      
      vec3 correctColor = vec3(0.2, 1.0, 0.3);
      float correctStrength = correctPosition * 0.5;
      
      vec3 finalColor = texColor.rgb * (vec3(0.3) + vec3(0.7) * diff);
      finalColor += highlightColor * highlightStrength + correctColor * correctStrength;
      
      gl_FragColor = vec4(finalColor, texColor.a);
    }
  `
};

// Particle System for visual effects
class ParticleSystem {
  constructor(scene) {
    this.particles = [];
    this.scene = scene;
    
    const geometry = new THREE.BufferGeometry();
    const material = new THREE.PointsMaterial({
      size: 0.05,
      map: new THREE.TextureLoader().load('/particle.png'),
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    
    this.particleSystem = new THREE.Points(geometry, material);
    scene.add(this.particleSystem);
  }
  
  emit(position, count = 20) {
    for (let i = 0; i < count; i++) {
      this.particles.push({
        position: position.clone(),
        velocity: new THREE.Vector3(
          (Math.random() - 0.5) * 0.2,
          (Math.random() - 0.5) * 0.2,
          Math.random() * 0.2
        ),
        life: 1.0
      });
    }
    this.updateGeometry();
  }
  
  update(deltaTime) {
    this.particles = this.particles.filter(particle => {
      particle.life -= deltaTime;
      particle.position.add(particle.velocity.clone().multiplyScalar(deltaTime));
      return particle.life > 0;
    });
    this.updateGeometry();
  }
  
  updateGeometry() {
    const positions = new Float32Array(this.particles.length * 3);
    this.particles.forEach((particle, i) => {
      positions[i * 3] = particle.position.x;
      positions[i * 3 + 1] = particle.position.y;
      positions[i * 3 + 2] = particle.position.z;
    });
    this.particleSystem.geometry.setAttribute(
      'position',
      new THREE.BufferAttribute(positions, 3)
    );
  }
}

const MultiplayerPuzzle = ({ gameId, isHost }) => {
  // Firebase setup
  const storage = getStorage();
  const database = getDatabase();
  const navigate = useNavigate();

  // Get user data
  const userData = JSON.parse(localStorage.getItem('authUser'));
  const userId = userData?.uid || `user-${Date.now()}`;
  const userName = userData?.displayName || userData?.email || `Player ${Math.floor(Math.random() * 1000)}`;

  // Enhanced state management for host status
  const [gameState, setGameState] = useState(() => {
    const savedState = localStorage.getItem(`puzzle_state_${gameId}`);
    return savedState ? JSON.parse(savedState) : {
      gameId: gameId || `game-${Date.now()}`,
      imageUrl: '',
      isHost: isHost || window.location.hash.includes('host=true'), // Check URL for host status
      difficulty: 3,
      timer: 0,
      gameStatus: 'waiting',
      createdBy: userId // Store creator's ID
    };
  });

  // Save game state to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem(`puzzle_state_${gameId}`, JSON.stringify(gameState));
  }, [gameState, gameId]);

  // Add piece position caching
  const [pieces, setPieces] = useState(() => {
    const savedPieces = localStorage.getItem(`puzzle_pieces_${gameId}`);
    return savedPieces ? JSON.parse(savedPieces) : [];
  });

  useEffect(() => {
    localStorage.setItem(`puzzle_pieces_${gameId}`, JSON.stringify(pieces));
  }, [pieces, gameId]);

  // Add player state caching
  const [players, setPlayers] = useState(() => {
    const savedPlayers = localStorage.getItem(`puzzle_players_${gameId}`);
    return savedPlayers ? JSON.parse(savedPlayers) : {};
  });

  useEffect(() => {
    localStorage.setItem(`puzzle_players_${gameId}`, JSON.stringify(players));
  }, [players, gameId]);

  const [activePiece, setActivePiece] = useState(null);
  const [progress, setProgress] = useState(0);

  // Refs for Three.js
  const containerRef = useRef(null);
  const sceneRef = useRef(null);
  const cameraRef = useRef(null);
  const rendererRef = useRef(null);
  const controlsRef = useRef(null);
  const puzzlePiecesRef = useRef([]);
  const particleSystemRef = useRef(null);

  // Add these utility functions at the top level
  const SNAP_THRESHOLD = 0.2;
  const ROTATION_STEP = Math.PI / 2;

  const isNearCorrectPosition = (piece, position) => {
    const dx = Math.abs(position.x - piece.userData.correctX);
    const dy = Math.abs(position.y - piece.userData.correctY);
    return dx < SNAP_THRESHOLD && dy < SNAP_THRESHOLD;
  };

  const normalizeRotation = (rotation) => {
    return Math.round(rotation / ROTATION_STEP) * ROTATION_STEP;
  };

  // Initialize game session with simplified host handling
  useEffect(() => {
    const gameRef = dbRef(database, `games/${gameState.gameId}`);
    
    const initializeGame = async () => {
      try {
        const snapshot = await get(gameRef);
        const data = snapshot.val();
        
        // Check if this is a join link
        const isJoinLink = window.location.hash.includes('join=true');
        
        if (!data) {
          // Only create new game if user is host and not joining
          if (gameState.isHost && !isJoinLink) {
            await set(gameRef, {
              players: {
                [userId]: {
                  id: userId,
                  name: userName,
                  score: 0,
                  color: `#${Math.floor(Math.random()*16777215).toString(16)}`,
                  isHost: true
                }
              },
              createdBy: userId,
              imageUrl: '',
              gameStatus: 'waiting',
              pieces: [],
              created: Date.now()
            });
          } else {
            console.error('Game not found');
            navigate('/'); // Redirect if game doesn't exist
            return;
          }
        } else {
          // Handle joining player
          const playerUpdate = {
            [`players/${userId}`]: {
              id: userId,
              name: userName,
              score: 0,
              color: `#${Math.floor(Math.random()*16777215).toString(16)}`,
              isHost: false,
              joinedAt: Date.now()
            }
          };
          
          await update(gameRef, playerUpdate);
          
          // Set local state
          setGameState(prev => ({
            ...prev,
            ...data,
            isHost: data.createdBy === userId
          }));
          
          setPieces(data.pieces || []);
          setPlayers({
            ...data.players,
            [userId]: playerUpdate[`players/${userId}`]
          });
        }
      } catch (err) {
        console.error('Failed to initialize game:', err);
      }
    };

    initializeGame();

    // Set up real-time listeners
    const unsubscribe = onValue(gameRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        setGameState(prev => ({
          ...prev,
          ...data,
          isHost: data.createdBy === userId // Maintain host status based on creator
        }));
        
        if (data.pieces) {
          setPieces(data.pieces);
          updatePuzzlePieces(data.pieces);
        }
        
        setPlayers(data.players || {});
      }
    });

    return () => {
      unsubscribe();
      cleanupGame();
    };
  }, [gameState.gameId]);

  // Update game state from Firebase
  const updateGameState = (data) => {
    setGameState(prev => ({
      ...prev,
      imageUrl: data.imageUrl || '',
      gameStatus: data.gameStatus || 'waiting'
    }));
    setPlayers(data.players || {});
    if (data.pieces) {
      setPieces(data.pieces);
      updatePuzzlePieces(data.pieces);
    }
  };

  // Update puzzle pieces with better sync
  const updatePuzzlePieces = (piecesData) => {
    const piecesArray = Array.isArray(piecesData) ? piecesData : Object.values(piecesData);
    
    puzzlePiecesRef.current.forEach(piece => {
      const pieceData = piecesArray.find(p => p.id === piece.userData.id);
      if (pieceData) {
        // Only update if the piece was moved by another player
        if (pieceData.lastUpdatedBy !== userId) {
          piece.position.set(
            pieceData.position.x,
            pieceData.position.y,
            pieceData.position.z
          );
          piece.rotation.set(
            pieceData.rotation.x,
            pieceData.rotation.y,
            pieceData.rotation.z
          );
          
          // Update material uniforms for visual feedback
          if (piece.material.uniforms) {
            piece.material.uniforms.correctPosition.value = pieceData.isPlaced ? 1.0 : 0.0;
            piece.material.uniforms.selected.value = 0.0;
          }
        }
        
        // Update piece state
        piece.userData.isPlaced = pieceData.isPlaced;
      }
    });
  };

  // Enhanced piece movement handler with local caching
  const handlePieceMove = async (piece, position, rotation) => {
    try {
      if (!piece || gameState.gameStatus !== 'playing') return;

      const finalPosition = position.clone();
      const finalRotation = piece.rotation.clone();
      let isPlaced = false;

      // Check if piece is near its correct position
      if (isNearCorrectPosition(piece, position)) {
        finalPosition.x = piece.userData.correctX;
        finalPosition.y = piece.userData.correctY;
        finalPosition.z = 0;
        
        // Normalize rotation to nearest 90 degrees
        finalRotation.z = normalizeRotation(finalRotation.z);
        
        // Check if rotation is correct
        if (Math.abs(finalRotation.z % (Math.PI * 2)) < 0.1) {
          isPlaced = true;
          particleSystemRef.current?.emit(finalPosition, 30);
        }
      }

      // Update piece locally first
      const updatedPiece = {
        id: piece.userData.id,
        position: {
          x: finalPosition.x,
          y: finalPosition.y,
          z: finalPosition.z
        },
        rotation: {
          x: finalRotation.x,
          y: finalRotation.y,
          z: finalRotation.z
        },
        isPlaced,
        lastUpdatedBy: userId,
        timestamp: Date.now()
      };

      // Update local cache
      const updatedPieces = pieces.map(p => 
        p.id === updatedPiece.id ? updatedPiece : p
      );
      setPieces(updatedPieces);
      localStorage.setItem(`puzzle_pieces_${gameId}`, JSON.stringify(updatedPieces));

      // Then update Firebase
      const pieceRef = dbRef(database, `games/${gameState.gameId}/pieces/${piece.userData.id}`);
      await set(pieceRef, updatedPiece);

      // Update progress
      const placedPieces = puzzlePiecesRef.current.filter(p => p.userData.isPlaced).length;
      const newProgress = (placedPieces / puzzlePiecesRef.current.length) * 100;
      setProgress(newProgress);

      if (newProgress === 100) {
        await update(dbRef(database, `games/${gameState.gameId}`), {
          gameStatus: 'completed',
          endTime: Date.now()
        });
      }
    } catch (err) {
      console.error('Failed to update piece position:', err);
    }
  };

  // Initialize Three.js scene
  useEffect(() => {
    if (!containerRef.current) return;

    // Scene setup
    const scene = new THREE.Scene();
    sceneRef.current = scene;

    // Camera setup
    const camera = new THREE.PerspectiveCamera(75, containerRef.current.clientWidth / containerRef.current.clientHeight, 0.1, 1000);
    camera.position.z = 5;
    cameraRef.current = camera;

    // Renderer setup
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(containerRef.current.clientWidth, containerRef.current.clientHeight);
    containerRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controlsRef.current = controls;

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(5, 5, 5);
    scene.add(directionalLight);

    // Particle system
    particleSystemRef.current = new ParticleSystem(scene);

    // Animation loop
    const animate = () => {
      requestAnimationFrame(animate);
      controls.update();
      particleSystemRef.current.update(0.016);
      renderer.render(scene, camera);
    };
    animate();

    return () => {
      renderer.dispose();
      containerRef.current?.removeChild(renderer.domElement);
    };
  }, []);

  // Handle piece interaction
  useEffect(() => {
    if (!rendererRef.current || !cameraRef.current) return;

    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();
    let isDragging = false;

    const handleMouseDown = (event) => {
      const rect = rendererRef.current.domElement.getBoundingClientRect();
      mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(mouse, cameraRef.current);
      const intersects = raycaster.intersectObjects(puzzlePiecesRef.current);

      if (intersects.length > 0) {
        isDragging = true;
        setActivePiece(intersects[0].object);
        controlsRef.current.enabled = false;
      }
    };

    const handleMouseMove = (event) => {
      if (!isDragging || !activePiece) return;

      const rect = rendererRef.current.domElement.getBoundingClientRect();
      mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(mouse, cameraRef.current);
      const intersectPoint = new THREE.Vector3();
      const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1));
      raycaster.ray.intersectPlane(plane, intersectPoint);

      handlePieceMove(activePiece, intersectPoint, activePiece.rotation);
    };

    const handleMouseUp = () => {
      if (isDragging && activePiece) {
        isDragging = false;
        setActivePiece(null);
        controlsRef.current.enabled = true;
      }
    };

    const handleKeyDown = (event) => {
      if (event.key === 'r' && activePiece) {
        handlePieceRotation(activePiece);
      }
    };

    const element = rendererRef.current.domElement;
    element.addEventListener('mousedown', handleMouseDown);
    element.addEventListener('mousemove', handleMouseMove);
    element.addEventListener('mouseup', handleMouseUp);
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      element.removeEventListener('mousedown', handleMouseDown);
      element.removeEventListener('mousemove', handleMouseMove);
      element.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [activePiece]);

  // Add piece rotation handler
  const handlePieceRotation = (piece) => {
    if (piece) {
      piece.rotation.z += ROTATION_STEP;
      handlePieceMove(piece, piece.position, piece.rotation);
    }
  };

  // Cleanup localStorage on game end
  const cleanupGame = async () => {
    try {
      localStorage.removeItem(`puzzle_state_${gameId}`);
      localStorage.removeItem(`puzzle_pieces_${gameId}`);
      localStorage.removeItem(`puzzle_players_${gameId}`);
      
      const updates = {};
      updates[`games/${gameState.gameId}/players/${userId}`] = null;
      
      // Only allow complete game deletion if the leaving player is the host
      if (gameState.isHost) {
        await set(dbRef(database, `games/${gameState.gameId}`), null);
      } else {
        await update(dbRef(database), updates);
      }
    } catch (err) {
      console.error('Failed to cleanup game:', err);
    }
  };

  // Add game state effect
  useEffect(() => {
    if (gameState.gameStatus === 'completed') {
      // Clear timer
      if (gameState.timerRef) {
        clearInterval(gameState.timerRef);
      }
  
      // Calculate final score
      const timeBonus = Math.max(0, 1000 - gameState.timer);
      const finalScore = timeBonus + (progress * 10);
  
      // Update player score
      update(dbRef(database, `games/${gameState.gameId}/players/${userId}`), {
        score: finalScore
      });
    }
  }, [gameState.gameStatus]);

  // Add Timer component
  const Timer = () => {
    const [time, setTime] = useState(0);
  
    useEffect(() => {
      if (gameState.gameStatus === 'playing') {
        const interval = setInterval(() => {
          setTime(prev => prev + 1);
        }, 1000);
  
        return () => clearInterval(interval);
      }
    }, [gameState.gameStatus]);
  
    const formatTime = (seconds) => {
      const mins = Math.floor(seconds / 60);
      const secs = seconds % 60;
      return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    };
  
    return (
      <div className="flex items-center gap-2 text-white">
        <Clock className="w-5 h-5" />
        <span>{formatTime(time)}</span>
      </div>
    );
  };

  // Modified player list component with host controls
  const PlayerList = () => (
    <div className="absolute right-4 top-4 bg-gray-800 p-4 rounded-lg">
      <h3 className="text-white font-bold mb-2">Players</h3>
      {Object.values(players).map(player => (
        <div key={player.id} className="flex items-center gap-2 text-white">
          <div 
            className="w-3 h-3 rounded-full"
            style={{ backgroundColor: player.color }}
          />
          <span>{player.name}</span>
          <span className="ml-auto">{player.score || 0}</span>
          {player.isHost && (
            <span className="text-xs bg-blue-500 px-2 py-1 rounded">Host</span>
          )}
        </div>
      ))}
    </div>
  );

  // Modified game controls with host-only actions
  const GameControls = () => (
    <div className="absolute bottom-4 left-4 flex gap-2">
      {gameState.isHost && (
        <>
          <button
            onClick={() => {
              update(dbRef(database, `games/${gameState.gameId}`), {
                gameStatus: gameState.gameStatus === 'playing' ? 'paused' : 'playing'
              });
            }}
            className="p-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            {gameState.gameStatus === 'playing' ? (
              <Pause className="w-5 h-5" />
            ) : (
              <Play className="w-5 h-5" />
            )}
          </button>
          <button
            onClick={() => {
              update(dbRef(database, `games/${gameState.gameId}`), {
                gameStatus: 'reset'
              });
            }}
            className="p-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
          >
            <RotateCcw className="w-5 h-5" />
          </button>
        </>
      )}
    </div>
  );

  // Copy game link functionality
  const copyGameLink = async () => {
    const baseUrl = window.location.origin;
    const link = gameState.isHost 
      ? `${baseUrl}/#/puzzle/multiplayer/${gameState.gameId}?host=true`
      : `${baseUrl}/#/puzzle/multiplayer/${gameState.gameId}?join=true`;
    
    try {
      await navigator.clipboard.writeText(link);
      alert('Game link copied to clipboard! Share this with other players.');
    } catch (err) {
      console.error('Failed to copy game link:', err);
    }
  };

  const createPuzzlePieces = async (imageUrl, difficulty, scene) => {
    const texture = await new Promise((resolve, reject) => {
      new THREE.TextureLoader().load(imageUrl, resolve, undefined, reject);
    });
  
    const pieceWidth = 1 / difficulty;
    const pieceHeight = 1 / difficulty;
    const pieces = [];
  
    for (let y = 0; y < difficulty; y++) {
      for (let x = 0; x < difficulty; x++) {
        // Create piece geometry
        const geometry = new THREE.PlaneGeometry(pieceWidth * 0.95, pieceHeight * 0.95);
        
        // Create shader material
        const material = new THREE.ShaderMaterial({
          uniforms: {
            map: { value: texture },
            uvOffset: { value: new THREE.Vector2(x / difficulty, y / difficulty) },
            uvScale: { value: new THREE.Vector2(1 / difficulty, 1 / difficulty) },
            selected: { value: 0.0 },
            correctPosition: { value: 0.0 },
            time: { value: 0.0 }
          },
          vertexShader: puzzlePieceShader.vertexShader,
          fragmentShader: puzzlePieceShader.fragmentShader,
          transparent: true
        });
  
        const piece = new THREE.Mesh(geometry, material);
        
        // Set initial random position
        piece.position.x = (Math.random() - 0.5) * 2;
        piece.position.y = (Math.random() - 0.5) * 2;
        piece.position.z = Math.random() * 0.1;
  
        // Store piece data
        piece.userData = {
          id: `piece-${x}-${y}`,
          correctX: (x - difficulty/2 + 0.5) * pieceWidth,
          correctY: (y - difficulty/2 + 0.5) * pieceHeight,
          isPlaced: false
        };
  
        scene.add(piece);
        pieces.push(piece);
      }
    }
  
    return pieces;
  };

  const SuccessModal = ({ onClose, score, timeElapsed }) => (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white p-6 rounded-lg shadow-xl max-w-md w-full">
        <h2 className="text-2xl font-bold mb-4">Puzzle Completed! 🎉</h2>
        <p className="mb-2">Score: {score}</p>
        <p className="mb-4">Time: {timeElapsed} seconds</p>
        <button
          onClick={onClose}
          className="w-full p-2 bg-blue-600 text-white rounded hover:bg-blue-700"
        >
          Close
        </button>
      </div>
    </div>
  );

  // Add a join status message component
  const JoinStatus = () => {
    const isJoining = window.location.hash.includes('join=true');
    
    if (isJoining && !gameState.imageUrl) {
      return (
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 
                      bg-gray-800 p-4 rounded-lg text-white text-center">
          <p>Waiting for host to start the game...</p>
          <p className="text-sm text-gray-400 mt-2">The host needs to upload an image to begin</p>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="w-full h-screen flex flex-col bg-gray-900">
      {/* Header with controls */}
      <div className="p-4 bg-gray-800 flex items-center justify-between">
        <div className="flex items-center gap-4">
          {gameState.isHost && gameState.gameStatus === 'waiting' && (
            // Only host can upload image and start game
            <label className="relative cursor-pointer">
              <input
                type="file"
                accept="image/*"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    try {
                      // Upload image
                      const imageRef = storageRef(storage, `puzzles/${gameState.gameId}`);
                      const snapshot = await uploadBytes(imageRef, file);
                      const url = await getDownloadURL(snapshot.ref);

                      // Create puzzle pieces
                      const newPieces = await createPuzzlePieces(url, gameState.difficulty, sceneRef.current);
                      puzzlePiecesRef.current = newPieces;

                      // Initialize puzzle state in Firebase
                      const piecesData = newPieces.map(piece => ({
                        id: piece.userData.id,
                        position: {
                          x: piece.position.x,
                          y: piece.position.y,
                          z: piece.position.z
                        },
                        rotation: {
                          x: piece.rotation.x,
                          y: piece.rotation.y,
                          z: piece.rotation.z
                        },
                        correctPosition: {
                          x: piece.userData.correctX,
                          y: piece.userData.correctY,
                          z: 0
                        },
                        isPlaced: false
                      }));

                      // Update game state in Firebase
                      await update(dbRef(database, `games/${gameState.gameId}`), {
                        imageUrl: url,
                        pieces: piecesData,
                        gameStatus: 'playing',
                        startTime: Date.now(),
                        timer: 0
                      });

                      // Start game timer
                      const timerRef = setInterval(() => {
                        update(dbRef(database, `games/${gameState.gameId}`), {
                          timer: increment(1)
                        });
                      }, 1000);

                      // Store timer reference for cleanup
                      gameState.timerRef = timerRef;
                    } catch (error) {
                      console.error('Error initializing puzzle:', error);
                    }
                  }
                }}
                className="hidden"
              />
              <div className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 
                            rounded-lg text-white transition-colors">
                <Camera className="w-5 h-5" />
                <span>Upload Image</span>
              </div>
            </label>
          )}

          <button
            onClick={copyGameLink}
            className="p-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg"
          >
            <Share2 className="w-5 h-5" />
          </button>
        </div>

        <div className="flex items-center gap-4">
          <Timer />
          <div className="text-white">
            Players: {Object.keys(players).length}
          </div>
          {gameState.gameStatus === 'playing' && (
            <div className="text-white">
              Progress: {Math.round(progress)}%
            </div>
          )}
        </div>
      </div>

      {/* Main puzzle area */}
      <div className="flex-1 relative">
        <div ref={containerRef} className="w-full h-full" />
        <PlayerList />
        <GameControls />
        <JoinStatus />

        {/* Camera controls */}
        <div className="absolute left-4 top-4 flex flex-col gap-2">
          <button
            onClick={() => cameraRef.current.position.z -= 1}
            className="p-2 bg-gray-800 text-white rounded-lg hover:bg-gray-700"
          >
            <ZoomIn className="w-5 h-5" />
          </button>
          <button
            onClick={() => cameraRef.current.position.z += 1}
            className="p-2 bg-gray-800 text-white rounded-lg hover:bg-gray-700"
          >
            <ZoomOut className="w-5 h-5" />
          </button>
          <button
            onClick={() => {
              cameraRef.current.position.set(0, 0, 5);
              controlsRef.current.reset();
            }}
            className="p-2 bg-gray-800 text-white rounded-lg hover:bg-gray-700"
          >
            <Maximize2 className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation buttons */}
        <div className="absolute top-4 right-4 flex gap-2">
          <button
            onClick={() => navigate('/')}
            className="p-2 bg-gray-800 text-white rounded-lg hover:bg-gray-700"
          >
            <Home className="w-5 h-5" />
          </button>
          <button
            onClick={async () => {
              await cleanupGame();
              navigate('/');
            }}
            className="p-2 bg-gray-800 text-white rounded-lg hover:bg-gray-700"
          >
            <LogOut className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default MultiplayerPuzzle;