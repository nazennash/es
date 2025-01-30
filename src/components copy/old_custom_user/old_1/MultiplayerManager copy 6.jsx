import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass';
import { Camera, Check, Info, Clock, ZoomIn, ZoomOut, Maximize2, RotateCcw, Image, Play, Pause, Share, Users } from 'lucide-react';
import { initializeApp } from 'firebase/app';
import { getDatabase, ref, set, onValue, remove, update, push, onDisconnect } from 'firebase/database';
import { v4 as uuidv4 } from 'uuid';

// Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyAuzyxG9Cs1ma9chjR-uJZegoMAc1Vp2Ig",
  authDomain: "nash-ac5c0.firebaseapp.com",
  projectId: "nash-ac5c0",
  storageBucket: "nash-ac5c0.firebasestorage.app",
  messagingSenderId: "49955314335",
  appId: "1:49955314335:web:e12140aa04351c658060aa",
  measurementId: "G-Y1LW4LFGR2",
  databaseURL: "https://nash-ac5c0-default-rtdb.firebaseio.com/",
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const database = getDatabase(app);

// Difficulty presets
const DIFFICULTY_SETTINGS = {
  easy: { grid: { x: 3, y: 2 }, snapDistance: 0.4, rotationEnabled: false },
  medium: { grid: { x: 4, y: 3 }, snapDistance: 0.3, rotationEnabled: true },
  hard: { grid: { x: 5, y: 4 }, snapDistance: 0.2, rotationEnabled: true },
  expert: { grid: { x: 6, y: 5 }, snapDistance: 0.15, rotationEnabled: true }
};

// Achievement definitions
const ACHIEVEMENTS = [
  { id: 'speed_demon', name: 'Speed Demon', description: 'Complete puzzle under 2 minutes', icon: '⚡' },
  { id: 'perfectionist', name: 'Perfectionist', description: 'Complete without misplacing pieces', icon: '✨' },
  { id: 'persistent', name: 'Persistent', description: 'Complete on expert difficulty', icon: '🏆' }
];

// Shader definitions for puzzle pieces
const puzzlePieceShader = {
  vertexShader: `
    varying vec2 vUv;
    varying vec3 vNormal;
    varying vec3 vPosition;
    
    uniform vec2 uvOffset;
    uniform vec2 uvScale;
    uniform float time;
    uniform float extrusionScale;
    uniform sampler2D heightMap;
    
    void main() {
      vUv = uvOffset + uv * uvScale;
      vNormal = normalize(normalMatrix * normal);
      vPosition = position;
      
      vec4 heightColor = texture2D(heightMap, vUv);
      float height = (heightColor.r + heightColor.g + heightColor.b) / 3.0;
      vec3 newPosition = position + normal * height * extrusionScale;
      
      gl_Position = projectionMatrix * modelViewMatrix * vec4(newPosition, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D map;
    uniform float selected;
    uniform float correctPosition;
    uniform float time;
    
    varying vec2 vUv;
    varying vec3 vNormal;
    varying vec3 vPosition;
    
    void main() {
      vec4 texColor = texture2D(map, vUv);
      vec3 normal = normalize(vNormal);
      vec3 lightDir = normalize(vec3(5.0, 5.0, 5.0));
      float diff = max(dot(normal, lightDir), 0.0);
      
      vec3 highlightColor = vec3(0.3, 0.6, 1.0);
      float highlightStrength = selected * 0.5 * (0.5 + 0.5 * sin(time * 3.0));
      
      vec3 correctColor = vec3(0.2, 1.0, 0.3);
      float correctStrength = correctPosition * 0.5 * (0.5 + 0.5 * sin(time * 2.0));
      
      vec3 finalColor = texColor.rgb * (vec3(0.3) + vec3(0.7) * diff);
      finalColor += highlightColor * highlightStrength + correctColor * correctStrength;
      
      float edgeStrength = 1.0 - smoothstep(0.0, 0.1, abs(vPosition.x) - 0.45);
      edgeStrength += 1.0 - smoothstep(0.0, 0.1, abs(vPosition.y) - 0.45);
      finalColor += vec3(0.2) * edgeStrength;
      
      float wobble = sin(time * 2.0 + vPosition.x * 10.0 + vPosition.y * 10.0) * 0.02;
      finalColor += vec3(wobble);
      
      gl_FragColor = vec4(finalColor, texColor.a);
    }
  `
};

// Sound System Class
class SoundSystem {
  constructor() {
    this.context = new (window.AudioContext || window.webkitAudioContext)();
    this.sounds = {};
    this.enabled = true;
  }

  async initialize() {
    this.sounds.pickup = this.createToneBuffer(440, 0.1);
    this.sounds.place = this.createToneBuffer(880, 0.15);
    this.sounds.complete = this.createToneBuffer([523.25, 659.25, 783.99], 0.3);
  }

  createToneBuffer(frequency, duration) {
    const sampleRate = this.context.sampleRate;
    const buffer = this.context.createBuffer(1, duration * sampleRate, sampleRate);
    const data = buffer.getChannelData(0);
    const frequencies = Array.isArray(frequency) ? frequency : [frequency];

    for (let i = 0; i < buffer.length; i++) {
      let sample = 0;
      frequencies.forEach(freq => {
        sample += Math.sin(2 * Math.PI * freq * i / sampleRate);
      });
      data[i] = sample / frequencies.length * Math.exp(-3 * i / buffer.length);
    }
    return buffer;
  }

  play(soundName) {
    if (!this.enabled || !this.sounds[soundName]) return;
    const source = this.context.createBufferSource();
    source.buffer = this.sounds[soundName];
    source.connect(this.context.destination);
    source.start();
  }

  toggle() {
    this.enabled = !this.enabled;
    return this.enabled;
  }
}

// Particle System
class ParticleSystem {
  constructor(scene) {
    this.particles = [];
    this.scene = scene;
    
    const geometry = new THREE.BufferGeometry();
    const material = new THREE.PointsMaterial({
      size: 0.05,
      map: new THREE.TextureLoader().load('/api/placeholder/32/32'),
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

const PuzzleGame = () => {
  // Raycaster and mouse setup
  const raycaster = useRef(new THREE.Raycaster());
  const mouse = useRef(new THREE.Vector2());
  const dragPlane = useRef(new THREE.Plane());

  // Multiplayer state
  const [gameId, setGameId] = useState(null);
  const [playerId, setPlayerId] = useState(null);
  const [players, setPlayers] = useState({});
  const [isHost, setIsHost] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);

  // Game state
  const [image, setImage] = useState(null);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [completedPieces, setCompletedPieces] = useState(0);
  const [totalPieces, setTotalPieces] = useState(0);
  const [timeElapsed, setTimeElapsed] = useState(0);
  const [isTimerRunning, setIsTimerRunning] = useState(false);
  const [gameState, setGameState] = useState('initial'); // 'initial', 'playing', 'paused'
  const [showThumbnail, setShowThumbnail] = useState(false);

  // Refs
  const containerRef = useRef(null);
  const sceneRef = useRef(null);
  const cameraRef = useRef(null);
  const rendererRef = useRef(null);
  const composerRef = useRef(null);
  const controlsRef = useRef(null);
  const clockRef = useRef(new THREE.Clock());
  const particleSystemRef = useRef(null);
  const puzzlePiecesRef = useRef([]);
  const selectedPieceRef = useRef(null);
  const timerRef = useRef(null);
  const guideOutlinesRef = useRef([]);
  const isDragging = useRef(false);

  // Handlers
  const handleMouseDown = (event) => {
    event.preventDefault();
    
    const rect = rendererRef.current.domElement.getBoundingClientRect();
    mouse.current.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.current.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  
    raycaster.current.setFromCamera(mouse.current, cameraRef.current);
    const intersects = raycaster.current.intersectObjects(puzzlePiecesRef.current);
  
    if (intersects.length > 0) {
      isDragging.current = true;
      selectedPieceRef.current = intersects[0].object;
      controlsRef.current.enabled = false;
  
      selectedPieceRef.current.material.uniforms.selected.value = 1.0;
      
      const normal = new THREE.Vector3(0, 0, 1);
      dragPlane.current.setFromNormalAndCoplanarPoint(
        normal,
        selectedPieceRef.current.position
      );
    }
  };
  
  const handleMouseMove = (event) => {
    if (!isDragging.current || !selectedPieceRef.current || gameState !== 'playing') return;
  
    const rect = rendererRef.current.domElement.getBoundingClientRect();
    mouse.current.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.current.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  
    raycaster.current.setFromCamera(mouse.current, cameraRef.current);
    const intersectPoint = new THREE.Vector3();
    raycaster.current.ray.intersectPlane(dragPlane.current, intersectPoint);
    
    selectedPieceRef.current.position.copy(intersectPoint);
    
    const originalPos = selectedPieceRef.current.userData.originalPosition;
    const distance = originalPos.distanceTo(selectedPieceRef.current.position);
    
    if (distance < 0.3) {
      selectedPieceRef.current.material.uniforms.correctPosition.value = 
        1.0 - (distance / 0.3);
    } else {
      selectedPieceRef.current.material.uniforms.correctPosition.value = 0.0;
    }
  
    if (gameId) {
      const pieceIndex = puzzlePiecesRef.current.indexOf(selectedPieceRef.current);
      updatePiecePosition(selectedPieceRef.current, pieceIndex);
    }
  };
  
  const handleMouseUp = () => {
    if (!selectedPieceRef.current || gameState !== 'playing') return;
  
    const originalPos = selectedPieceRef.current.userData.originalPosition;
    const distance = originalPos.distanceTo(selectedPieceRef.current.position);
  
    if (distance < 0.3) {
      selectedPieceRef.current.position.copy(originalPos);
      selectedPieceRef.current.rotation.z = 0;
      
      if (!selectedPieceRef.current.userData.isPlaced) {
        selectedPieceRef.current.userData.isPlaced = true;
        setCompletedPieces(prev => {
          const newCount = prev + 1;
          setProgress((newCount / totalPieces) * 100);
          return newCount;
        });
  
        particleSystemRef.current.emit(selectedPieceRef.current.position, 30);
        
        if (gameId) {
          const pieceIndex = puzzlePiecesRef.current.indexOf(selectedPieceRef.current);
          updatePiecePosition(selectedPieceRef.current, pieceIndex);
          update(ref(database, `games/${gameId}/puzzle`), {
            completedPieces: completedPieces + 1
          });
        }
      }
    }
  
    selectedPieceRef.current.material.uniforms.selected.value = 0.0;
    selectedPieceRef.current.material.uniforms.correctPosition.value = 
      selectedPieceRef.current.userData.isPlaced ? 1.0 : 0.0;
    
    selectedPieceRef.current = null;
    isDragging.current = false;
    controlsRef.current.enabled = true;
  };
  
  // useEffect(() => {
  //   const element = rendererRef.current.domElement;
  //   element.addEventListener('mousedown', handleMouseDown);
  //   element.addEventListener('mousemove', handleMouseMove);
  //   element.addEventListener('mouseup', handleMouseUp);
  //   element.addEventListener('mouseleave', handleMouseUp);
  
  //   return () => {
  //     element.removeEventListener('mousedown', handleMouseDown);
  //     element.removeEventListener('mousemove', handleMouseMove);
  //     element.removeEventListener('mouseup', handleMouseUp);
  //     element.removeEventListener('mouseleave', handleMouseUp);
  //   };
  // }, [gameState, totalPieces, gameId]);

  // Window resize handler
  useEffect(() => {
    const handleResize = () => {
      if (!containerRef.current || !cameraRef.current || !rendererRef.current) return;
      
      const width = containerRef.current.clientWidth;
      const height = containerRef.current.clientHeight;
      
      cameraRef.current.aspect = width / height;
      cameraRef.current.updateProjectionMatrix();
      
      rendererRef.current.setSize(width, height);
      if (composerRef.current) {
        composerRef.current.setSize(width, height);
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);
  // Timer effect
  useEffect(() => {
    if (isTimerRunning) {
      timerRef.current = setInterval(() => {
        setTimeElapsed(prev => prev + 1);
      }, 1000);
    }

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [isTimerRunning]);

  // Game completion effect
  useEffect(() => {
    if (progress === 100) {
      setIsTimerRunning(false);
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }

      if (gameId) {
        update(ref(database, `games/${gameId}`), {
          state: 'completed',
          completionTime: timeElapsed
        });
      }
    }
  }, [progress, gameId, timeElapsed]);

  // Firebase game state sync
  useEffect(() => {
    if (!gameId) return;
    
    const gameRef = ref(database, `games/${gameId}`);
    const unsubscribe = onValue(gameRef, (snapshot) => {
      const gameData = snapshot.val();
      if (!gameData) return;
      
      setPlayers(gameData.players || {});
      
      // Sync puzzle state
      if (gameData.puzzle) {
        puzzlePiecesRef.current.forEach((piece, index) => {
          if (gameData.puzzle.pieces[index]) {
            const pieceData = gameData.puzzle.pieces[index];
            piece.position.copy(new THREE.Vector3(
              pieceData.position.x,
              pieceData.position.y,
              pieceData.position.z
            ));
            piece.rotation.z = pieceData.rotation;
            piece.userData.isPlaced = pieceData.isPlaced;
            if (piece.material.uniforms) {
              piece.material.uniforms.correctPosition.value = pieceData.isPlaced ? 1.0 : 0.0;
            }
          }
        });
        
        setCompletedPieces(gameData.puzzle.completedPieces);
        setProgress((gameData.puzzle.completedPieces / gameData.puzzle.totalPieces) * 100);
      }
      
      if (gameData.state) {
        setGameState(gameData.state);
        setIsTimerRunning(gameData.state === 'playing');
      }

      if (gameData.imageData && !image) {
        setImage(gameData.imageData);
        createPuzzlePieces(gameData.imageData);
      }
    });
    
    return () => unsubscribe();
  }, [gameId]);

  // Update piece positions in Firebase
  const updatePiecePosition = async (piece, index) => {
    if (!gameId) return;
    
    const pieceRef = ref(database, `games/${gameId}/puzzle/pieces/${index}`);
    await update(pieceRef, {
      position: {
        x: piece.position.x,
        y: piece.position.y,
        z: piece.position.z
      },
      rotation: piece.rotation.z,
      isPlaced: piece.userData.isPlaced
    });
  };

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const startGame = () => {
    setGameState('playing');
    setIsTimerRunning(true);
    
    if (gameId) {
      update(ref(database, `games/${gameId}`), {
        state: 'playing',
        startTime: Date.now()
      });
    }
  };

  const togglePause = () => {
    const newState = gameState === 'playing' ? 'paused' : 'playing';
    setGameState(newState);
    setIsTimerRunning(newState === 'playing');
    
    if (gameId) {
      update(ref(database, `games/${gameId}`), {
        state: newState,
        lastUpdated: Date.now()
      });
    }
  };

  const handleZoomIn = () => {
    if (cameraRef.current) {
      const newZ = Math.max(cameraRef.current.position.z - 1, 2);
      cameraRef.current.position.setZ(newZ);
    }
  };

  const handleZoomOut = () => {
    if (cameraRef.current) {
      const newZ = Math.min(cameraRef.current.position.z + 1, 10);
      cameraRef.current.position.setZ(newZ);
    }
  };

  const handleResetView = () => {
    if (cameraRef.current && controlsRef.current) {
      cameraRef.current.position.set(
        defaultCameraPosition.x,
        defaultCameraPosition.y,
        defaultCameraPosition.z
      );
      controlsRef.current.target.copy(defaultControlsTarget);
      controlsRef.current.update();
    }
  };

  const handleResetGame = () => {
    if (!sceneRef.current || !image) return;
    
    setTimeElapsed(0);
    setCompletedPieces(0);
    setProgress(0);
    setGameState('initial');
    setIsTimerRunning(false);
    
    puzzlePiecesRef.current.forEach(piece => {
      piece.position.x = piece.userData.originalPosition.x + (Math.random() - 0.5) * 2;
      piece.position.y = piece.userData.originalPosition.y + (Math.random() - 0.5) * 2;
      piece.position.z = Math.random() * 0.5;
      piece.rotation.z = (Math.random() - 0.5) * 0.5;
      piece.userData.isPlaced = false;
      if (piece.material.uniforms) {
        piece.material.uniforms.correctPosition.value = 0;
      }
    });

    
    if (gameId) {
      const pieceStates = puzzlePiecesRef.current.map(piece => ({
        position: {
          x: piece.position.x,
          y: piece.position.y,
          z: piece.position.z
        },
        rotation: piece.rotation.z,
        isPlaced: false
      }));
      
      update(ref(database, `games/${gameId}`), {
        state: 'initial',
        puzzle: {
          pieces: pieceStates,
          completedPieces: 0,
          totalPieces: totalPieces
        }
      });
    }
  };

  const handleImageUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;
  
    setLoading(true);
    const reader = new FileReader();
    
    reader.onload = async (e) => {
      setImage(e.target.result);
      await createPuzzlePieces(e.target.result);
      setLoading(false);
      setGameState('initial');
      setIsTimerRunning(false);
      setCompletedPieces(0);
      setProgress(0);
      setTimeElapsed(0);
      
      if (gameId) {
        await update(ref(database, `games/${gameId}`), {
          imageData: e.target.result,
          state: 'initial',
          puzzle: {
            pieces: [],
            completedPieces: 0,
            totalPieces: 0
          }
        });
      }
    };
  
    reader.onerror = () => {
      setLoading(false);
      console.error('Error reading file');
    };
  
    reader.readAsDataURL(file);
  };

  // Create a new multiplayer game session
  const createMultiplayerGame = async () => {
    const newGameId = uuidv4();
    const newPlayerId = uuidv4();
    
    setGameId(newGameId);
    setPlayerId(newPlayerId);
    setIsHost(true);
    
    const gameRef = ref(database, `games/${newGameId}`);
    await set(gameRef, {
      state: 'waiting',
      host: newPlayerId,
      created: Date.now(),
      players: {
        [newPlayerId]: {
          id: newPlayerId,
          name: `Player ${Object.keys(players).length + 1}`,
          isHost: true,
          lastActive: Date.now()
        }
      },
      puzzle: {
        difficulty: 'medium',
        pieces: [],
        completedPieces: 0,
        totalPieces: 0
      }
    });
    
    // Setup disconnect cleanup
    const playerRef = ref(database, `games/${newGameId}/players/${newPlayerId}`);
    onDisconnect(playerRef).remove();
    
    setShowShareModal(true);
  };

  // Join an existing multiplayer game
  const joinMultiplayerGame = async (gameId) => {
    const newPlayerId = uuidv4();
    setPlayerId(newPlayerId);
    setGameId(gameId);
    
    const playerRef = ref(database, `games/${gameId}/players/${newPlayerId}`);
    await set(playerRef, {
      id: newPlayerId,
      name: `Player ${Object.keys(players).length + 1}`,
      isHost: false,
      lastActive: Date.now()
    });
    
    // Setup disconnect cleanup
    onDisconnect(playerRef).remove();
  };

  // Leave multiplayer game
  const leaveMultiplayerGame = async () => {
    if (!gameId || !playerId) return;
    
    const playerRef = ref(database, `games/${gameId}/players/${playerId}`);
    await remove(playerRef);
    
    if (isHost) {
      const gameRef = ref(database, `games/${gameId}`);
      await remove(gameRef);
    }
    
    setGameId(null);
    setPlayerId(null);
    setIsHost(false);
    setPlayers({});
  };

  // Create puzzle pieces
  const createPuzzlePieces = async (imageUrl) => {
    if (!sceneRef.current) return;

    puzzlePiecesRef.current.forEach(piece => {
      sceneRef.current.remove(piece);
    });
    puzzlePiecesRef.current = [];

    const texture = await new THREE.TextureLoader().loadAsync(imageUrl);
    const aspectRatio = texture.image.width / texture.image.height;

    const gridSize = { x: 4, y: 3 };
    const pieceSize = {
      x: 1 * aspectRatio / gridSize.x,
      y: 1 / gridSize.y
    };

    setTotalPieces(gridSize.x * gridSize.y);
    createPlacementGuides(gridSize, pieceSize);

    for (let y = 0; y < gridSize.y; y++) {
      for (let x = 0; x < gridSize.x; x++) {
        const geometry = new THREE.PlaneGeometry(
          pieceSize.x * 0.95,
          pieceSize.y * 0.95,
          32,
          32
        );

        const material = new THREE.ShaderMaterial({
          uniforms: {
            map: { value: texture },
            heightMap: { value: texture },
            uvOffset: { value: new THREE.Vector2(x / gridSize.x, y / gridSize.y) },
            uvScale: { value: new THREE.Vector2(1 / gridSize.x, 1 / gridSize.y) },
            extrusionScale: { value: 0.15 },
            selected: { value: 0.0 },
            correctPosition: { value: 0.0 },
            time: { value: 0.0 }
          },
          vertexShader: puzzlePieceShader.vertexShader,
          fragmentShader: puzzlePieceShader.fragmentShader,
          side: THREE.DoubleSide
        });

        const piece = new THREE.Mesh(geometry, material);
        
        piece.position.x = (x - gridSize.x / 2 + 0.5) * pieceSize.x;
        piece.position.y = (y - gridSize.y / 2 + 0.5) * pieceSize.y;
        piece.position.z = 0;

        piece.userData.originalPosition = piece.position.clone();
        piece.userData.gridPosition = { x, y };
        piece.userData.isPlaced = false;

        sceneRef.current.add(piece);
        puzzlePiecesRef.current.push(piece);
      }
    }

    // Scramble pieces
    puzzlePiecesRef.current.forEach(piece => {
      piece.position.x += (Math.random() - 0.5) * 2;
      piece.position.y += (Math.random() - 0.5) * 2;
      piece.position.z += Math.random() * 0.5;
      piece.rotation.z = (Math.random() - 0.5) * 0.5;
    });

  // Create placement guides
  const createPlacementGuides = (gridSize, pieceSize) => {
    guideOutlinesRef.current.forEach(guide => sceneRef.current.remove(guide));
    guideOutlinesRef.current = [];

    for (let y = 0; y < gridSize.y; y++) {
      for (let x = 0; x < gridSize.x; x++) {
        const outlineGeometry = new THREE.EdgesGeometry(
          new THREE.PlaneGeometry(pieceSize.x * 0.95, pieceSize.y * 0.95)
        );
        const outlineMaterial = new THREE.LineBasicMaterial({ 
          color: 0x4a90e2,
          transparent: true,
          opacity: 0.5
        });
        const outline = new THREE.LineSegments(outlineGeometry, outlineMaterial);

        outline.position.x = (x - gridSize.x / 2 + 0.5) * pieceSize.x;
        outline.position.y = (y - gridSize.y / 2 + 0.5) * pieceSize.y;
        outline.position.z = -0.01;

        sceneRef.current.add(outline);
        guideOutlinesRef.current.push(outline);
      }
    }
    
  };
};

  return (
    <div className="w-full h-screen flex flex-col bg-gray-900">
      {/* Header with controls */}
      <div className="p-4 bg-gray-800 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <label className="relative cursor-pointer">
            <input
              type="file"
              accept="image/*"
              onChange={handleImageUpload}
              className="hidden"
            />
            <div className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 
                          rounded-lg text-white transition-colors">
              <Camera className="w-5 h-5" />
              <span>Upload Photo</span>
            </div>
          </label>

          {/* Play/Pause controls */}
          <div className="flex items-center gap-2">
            {gameState !== 'initial' && (
              <button
                onClick={togglePause}
                className="p-2 bg-gray-700 text-white rounded-lg hover:bg-gray-600"
              >
                {gameState === 'playing' ? (
                  <Pause className="w-5 h-5" />
                ) : (
                  <Play className="w-5 h-5" />
                )}
              </button>
            )}
            
            {gameState === 'initial' && (
              <button
                onClick={startGame}
                className="p-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
              >
                <Play className="w-5 h-5" />
              </button>
            )}
          </div>

          {/* Timer display */}
          <div className="flex items-center gap-2 text-white bg-gray-700 px-3 py-1 rounded-lg">
            <Clock className="w-4 h-4" />
            <span>{formatTime(timeElapsed)}</span>
          </div>

          <button className="p-2 text-gray-300 hover:text-white">
            <Info className="w-5 h-5" />
          </button>

          {/* Multiplayer controls */}
          {!gameId ? (
            <div className="flex items-center gap-2">
              <button
                onClick={createMultiplayerGame}
                className="flex items-center gap-2 px-4 py-2 bg-green-600 
                          hover:bg-green-700 rounded-lg text-white transition-colors"
              >
                <Users className="w-5 h-5" />
                <span>Create Game</span>
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowShareModal(true)}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 
                          hover:bg-blue-700 rounded-lg text-white transition-colors"
              >
                <Share className="w-5 h-5" />
                <span>Share</span>
              </button>
              <button
                onClick={leaveMultiplayerGame}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 
                          rounded-lg text-white transition-colors"
              >
                Leave Game
              </button>
            </div>
          )}
        </div>

        {/* Player list */}
        {gameId && (
          <div className="flex items-center gap-4 px-4 py-2 bg-gray-700 rounded-lg">
            <Users className="w-5 h-5 text-gray-400" />
            <div className="flex gap-2">
              {Object.values(players).map((player) => (
                <div
                  key={player.id}
                  className={`px-2 py-1 rounded ${
                    player.isHost ? 'bg-blue-600' : 'bg-gray-600'
                  }`}
                >
                  {player.name}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Share Modal */}
      {showShareModal && (
        <div className="fixed inset-0 flex items-center justify-center 
                      bg-black bg-opacity-50 z-50">
          <div className="bg-gray-800 p-6 rounded-lg shadow-xl">
            <h3 className="text-xl text-white mb-4">Share Game</h3>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={`${window.location.origin}?game=${gameId}`}
                readOnly
                className="px-4 py-2 bg-gray-700 text-white rounded-lg w-96"
              />
              <button
                onClick={() => {
                  navigator.clipboard.writeText(
                    `${window.location.origin}?game=${gameId}`
                  );
                }}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 
                          rounded-lg text-white transition-colors"
              >
                Copy
              </button>
            </div>
            <button
              onClick={() => setShowShareModal(false)}
              className="mt-4 px-4 py-2 bg-gray-700 hover:bg-gray-600 
                        rounded-lg text-white transition-colors w-full"
            >
              Close
            </button>
          </div>
        </div>
      )}
      
      {/* Game container */}
      {/*<div className="w-full h-full flex items-center justify-center">
        <GameCanvas
          width={canvasWidth}
          height={canvasHeight}
          ref={canvasRef}
          onCanvasClick={handleCanvasClick}
        />
      </div>
      */}
      
    </div>
  );
};

export default PuzzleGame;