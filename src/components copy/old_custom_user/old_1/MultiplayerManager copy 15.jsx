
import React, { useState, useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass';
import { getStorage, ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import { getDatabase, ref as dbRef, set, onValue, update, get } from 'firebase/database';
import { 
  Camera, Check, Info, Clock, ZoomIn, ZoomOut, 
  Maximize2, RotateCcw, Image, Play, Pause,
  Share2, Users, Download, CameraIcon, LogOut, Home 
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { handlePuzzleCompletion } from './PuzzleCompletionHandler';


// Shader for puzzle pieces
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
      float correctStrength = correctPosition * 0.5 * (0.5 + 0.5 * sin(time * 2.0));
      
      vec3 finalColor = texColor.rgb * (vec3(0.3) + vec3(0.7) * diff);
      finalColor += highlightColor * highlightStrength + correctColor * correctStrength;
      
      gl_FragColor = vec4(finalColor, texColor.a);
    }
  `
};

// Particle system for visual effects
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

// Three.js Manager Class
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
    this.init();
  }

  init() {
    // Scene setup
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x1a1a1a);

    // Camera setup
    this.camera = new THREE.PerspectiveCamera(
      75,
      this.container.clientWidth / this.container.clientHeight,
      0.1,
      1000
    );
    this.camera.position.set(10, 10, 10);
    this.camera.lookAt(0, 0, 0);

    // Renderer setup
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true
    });
    this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.container.appendChild(this.renderer.domElement);

    // Post-processing
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.composer.addPass(new UnrealBloomPass(
      new THREE.Vector2(window.innerWidth, window.innerHeight),
      0.5,
      0.4,
      0.85
    ));

    // Controls
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;
    this.controls.maxDistance = 20;
    this.controls.minDistance = 5;

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
    this.scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(10, 10, 10);
    directionalLight.castShadow = true;
    this.scene.add(directionalLight);

    // Piece group
    this.pieceGroup = new THREE.Group();
    this.scene.add(this.pieceGroup);

    // Particle system
    this.particleSystem = new ParticleSystem(this.scene);

    // Raycaster setup
    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();

    // Clock for animations
    this.clock = new THREE.Clock();

    // Setup event listeners
    this.setupEventListeners();

    // Start animation loop
    this.animate();
  }

  // Continuing ThreeJSManager class...

  setupEventListeners() {
    window.addEventListener('resize', () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
      this.composer.setSize(window.innerWidth, window.innerHeight);
    });

    this.renderer.domElement.addEventListener('mousemove', (event) => {
      event.preventDefault();
      
      const rect = this.renderer.domElement.getBoundingClientRect();
      this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

      if (this.isDragging && this.draggedPiece) {
        this.handleDragMove(event);
      }
    });

    this.renderer.domElement.addEventListener('mousedown', (event) => {
      event.preventDefault();
      this.handleDragStart(event);
    });

    this.renderer.domElement.addEventListener('mouseup', (event) => {
      event.preventDefault();
      this.handleDragEnd(event);
    });
  }

  createPiece(pieceData, texture, dimensions, difficulty) {
    const { width, height, depth } = dimensions;
    const pieceWidth = width / difficulty;
    const pieceHeight = height / difficulty;
    const pieceDepth = depth;

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
      side: THREE.DoubleSide
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData.pieceId = pieceData.id;
    mesh.userData.correctPosition = new THREE.Vector3(
      (pieceData.correct.x - difficulty/2) * pieceWidth * 1.2,
      (pieceData.correct.y - difficulty/2) * pieceHeight * 1.2,
      0
    );

    // Random initial position in a sphere
    const radius = Math.max(width, height) * 1.5;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.random() * Math.PI;
    
    mesh.position.set(
      radius * Math.sin(phi) * Math.cos(theta),
      radius * Math.sin(phi) * Math.sin(theta),
      radius * Math.cos(phi)
    );

    mesh.rotation.set(
      Math.random() * Math.PI * 2,
      Math.random() * Math.PI * 2,
      Math.random() * Math.PI * 2
    );

    this.meshes.set(pieceData.id, mesh);
    this.pieceGroup.add(mesh);
    return mesh;
  }

  handleDragStart(event) {
    this.raycaster.setFromCamera(this.mouse, this.camera);
    const intersects = this.raycaster.intersectObjects(this.pieceGroup.children);

    if (intersects.length > 0) {
      this.controls.enabled = false;
      this.isDragging = true;
      this.draggedPiece = intersects[0].object;
      
      const normal = this.camera.getWorldDirection(new THREE.Vector3());
      this.dragPlane.setFromNormalAndCoplanarPoint(
        normal,
        this.draggedPiece.position
      );
      
      this.draggedPiece.material.uniforms.selected.value = 1.0;
      
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
      
      const correctPos = this.draggedPiece.userData.correctPosition;
      const distance = this.draggedPiece.position.distanceTo(correctPos);
      
      this.draggedPiece.material.uniforms.correctPosition.value = 
        distance < 0.3 ? 1.0 - (distance / 0.3) : 0.0;

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
    if (!this.draggedPiece) return;

    const correctPos = this.draggedPiece.userData.correctPosition;
    const distance = this.draggedPiece.position.distanceTo(correctPos);

    if (distance < 0.3) {
      this.draggedPiece.position.copy(correctPos);
      this.draggedPiece.rotation.set(0, 0, 0);
      
      if (!this.draggedPiece.userData.isPlaced) {
        this.draggedPiece.userData.isPlaced = true;
        this.particleSystem.emit(correctPos, 30);
        
        if (this.onPieceSnap) {
          this.onPieceSnap(this.draggedPiece.userData.pieceId, correctPos);
        }
      }
    }

    this.draggedPiece.material.uniforms.selected.value = 0.0;
    this.draggedPiece.material.uniforms.correctPosition.value = 
      this.draggedPiece.userData.isPlaced ? 1.0 : 0.0;

    this.controls.enabled = true;
    this.isDragging = false;
    this.draggedPiece = null;
  }

  updatePieces(piecesData, dimensions) {
    piecesData.forEach(pieceData => {
      const mesh = this.meshes.get(pieceData.id);
      if (mesh) {
        if (pieceData.isPlaced) {
          mesh.position.copy(mesh.userData.correctPosition);
          mesh.rotation.set(0, 0, 0);
          mesh.material.uniforms.correctPosition.value = 1.0;
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
          mesh.material.uniforms.correctPosition.value = 0.0;
        }
      }
    });
  }

  animate = () => {
    this.animationFrame = requestAnimationFrame(this.animate);
    
    const deltaTime = this.clock.getDelta();
    
    // Update controls
    this.controls.update();
    
    // Update particles
    this.particleSystem.update(deltaTime);
    
    // Update shader uniforms
    this.meshes.forEach(mesh => {
      if (mesh.material.uniforms) {
        mesh.material.uniforms.time.value = this.clock.getElapsedTime();
      }
    });
    
    // Render scene with post-processing
    this.composer.render();
  };

  cleanup() {
    if (this.animationFrame) {
      cancelAnimationFrame(this.animationFrame);
    }

    window.removeEventListener('resize', this.handleResize);
    this.renderer.domElement.removeEventListener('mousemove', this.handleDragMove);
    this.renderer.domElement.removeEventListener('mousedown', this.handleDragStart);
    this.renderer.domElement.removeEventListener('mouseup', this.handleDragEnd);

    if (this.renderer && this.container) {
      this.container.removeChild(this.renderer.domElement);
    }

    this.scene.clear();
    this.meshes.clear();
  }
}

const MultiplayerPuzzle3D = ({ puzzleId, gameId }) => {
  const userData = JSON.parse(localStorage.getItem('authUser'));
  const userId = userData.uid;
  const userName = userData.displayName || userData.email;

  // State management
  const [gameState, setGameState] = useState({
    gameId: gameId || window.location.pathname.split('/').pop() || `game-${Date.now()}`,
    imageUrl: '',
    isHost: true,
    difficulty: 3,
    timer: 0,
    startTime: null,
    lastUpdateTime: null,
    dimensions: {
      width: 1,
      height: 1,
      depth: 0.1
    },
    isCompleted: false
  });

  const [pieces, setPieces] = useState([]);
  const [players, setPlayers] = useState({});
  const [isGameStarted, setIsGameStarted] = useState(false);
  const [winner, setWinner] = useState(null);
  const [showShareModal, setShowShareModal] = useState(false);
  const [showThumbnail, setShowThumbnail] = useState(false);
  const [completedPieces, setCompletedPieces] = useState(0);
  const [progress, setProgress] = useState(0);

  const [ui, setUi] = useState({
    selectedPieceId: null,
    error: null,
    showPlayers: true,
    loading: false
  });

  // Refs
  const mountRef = useRef(null);
  const threeManagerRef = useRef(null);
  const timerRef = useRef(null);
  const storage = getStorage();
  const database = getDatabase();
  const navigate = useNavigate();

  // Initialize Three.js
  useEffect(() => {
    if (!mountRef.current) return;

    threeManagerRef.current = new ThreeJSManager(
      mountRef.current,
      handlePieceSelect,
      handlePieceMove,
      handlePieceSnap
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
        dimensions: data.dimensions || prev.dimensions,
        isCompleted: data.isCompleted || false
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
        
        // Update progress
        const completedCount = data.pieces.filter(p => p.isPlaced).length;
        setCompletedPieces(completedCount);
        setProgress((completedCount / data.pieces.length) * 100);
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

  const handlePieceSelect = (pieceId) => {
    setUi(prev => ({ ...prev, selectedPieceId: pieceId }));
  };

  const handlePieceMove = async (pieceId, position) => {
    const updates = {};
    updates[`games/${gameState.gameId}/pieces/${pieceId}/current`] = position;
    await update(dbRef(database), updates);
  };

  const handlePieceSnap = async (pieceId, position) => {
    const updates = {};
    updates[`games/${gameState.gameId}/pieces/${pieceId}/isPlaced`] = true;
    updates[`games/${gameState.gameId}/pieces/${pieceId}/current`] = position;
    await update(dbRef(database), updates);

    // Check if puzzle is complete
    const updatedPieces = pieces.map(p => 
      p.id === pieceId ? { ...p, isPlaced: true } : p
    );
    
    if (updatedPieces.every(p => p.isPlaced)) {
      handlePuzzleComplete();
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

  // Image upload and puzzle initialization
  const handleImageUpload = async (event) => {
    if (!gameState.isHost) return;
    
    const file = event.target.files?.[0];
    if (!file) return;
  
    try {
      setUi(prev => ({ ...prev, loading: true }));
      const imageRef = storageRef(storage, `puzzle-images/${gameState.gameId}/${file.name}`);
      const snapshot = await uploadBytes(imageRef, file);
      const url = await getDownloadURL(snapshot.ref);
      
      // Use TextureLoader instead of Image constructor
      const textureLoader = new THREE.TextureLoader();
      const texture = await new Promise((resolve, reject) => {
        textureLoader.load(
          url,
          (loadedTexture) => {
            const maxSize = 500;
            const scale = Math.min(1, maxSize / Math.max(loadedTexture.image.width, loadedTexture.image.height));
            
            const dimensions = {
              width: loadedTexture.image.width * scale,
              height: loadedTexture.image.height * scale,
              depth: Math.min(loadedTexture.image.width, loadedTexture.image.height) * scale * 0.1
            };
  
            resolve({ texture: loadedTexture, dimensions });
          },
          undefined,
          reject
        );
      });
  
      const updates = {
        [`games/${gameState.gameId}/imageUrl`]: url,
        [`games/${gameState.gameId}/dimensions`]: texture.dimensions
      };
      
      await update(dbRef(database), updates);
      setGameState(prev => ({ ...prev, dimensions: texture.dimensions }));
      setUi(prev => ({ ...prev, loading: false }));
  
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

      const newPieces = [];
      for (let y = 0; y < gameState.difficulty; y++) {
        for (let x = 0; x < gameState.difficulty; x++) {
          const pieceData = {
            id: `piece-${x}-${y}`,
            correct: { x, y },
            current: { 
              x: (Math.random() - 0.5) * 4,
              y: (Math.random() - 0.5) * 4,
              z: Math.random() * 0.5
            },
            rotation: {
              x: Math.random() * Math.PI * 2,
              y: Math.random() * Math.PI * 2,
              z: Math.random() * Math.PI * 2
            },
            isPlaced: false
          };
          newPieces.push(pieceData);

          if (threeManagerRef.current) {
            threeManagerRef.current.createPiece(
              pieceData,
              texture,
              gameState.dimensions,
              gameState.difficulty
            );
          }
        }
      }

      const updates = {
        [`games/${gameState.gameId}/pieces`]: newPieces,
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

  // Camera controls
  const handleZoomIn = () => {
    if (threeManagerRef.current) {
      threeManagerRef.current.camera.position.z = Math.max(
        threeManagerRef.current.camera.position.z - 1,
        2
      );
    }
  };

  const handleZoomOut = () => {
    if (threeManagerRef.current) {
      threeManagerRef.current.camera.position.z = Math.min(
        threeManagerRef.current.camera.position.z + 1,
        10
      );
    }
  };

  const handleResetView = () => {
    if (threeManagerRef.current) {
      threeManagerRef.current.camera.position.set(10, 10, 10);
      threeManagerRef.current.camera.lookAt(0, 0, 0);
      threeManagerRef.current.controls.target.set(0, 0, 0);
      threeManagerRef.current.controls.update();
    }
  };

  // Game state management
  const togglePause = async () => {
    const newState = !isGameStarted;
    await update(dbRef(database, `games/${gameState.gameId}/isGameStarted`), newState);
  };

  const handleLeaveGame = async () => {
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

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Render component
  return (
    <div className="w-full h-screen bg-gray-900">
      {/* Header with controls */}
      <div className="p-4 bg-gray-800 flex items-center justify-between">
        <div className="flex items-center gap-4">
          {gameState.isHost && !isGameStarted && (
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
          )}

          <div className="flex items-center gap-2 text-white bg-gray-700 px-3 py-1 rounded-lg">
            <Clock className="w-4 h-4" />
            <span>{formatTime(gameState.timer)}</span>
          </div>

          {isGameStarted && (
            <button
              onClick={togglePause}
              className="p-2 bg-gray-700 text-white rounded-lg hover:bg-gray-600"
            >
              {isGameStarted ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
            </button>
          )}
        </div>

        {/* Progress indicator */}
        {pieces.length > 0 && (
          <div className="flex items-center gap-4">
            <div className="flex flex-col items-end">
              <div className="text-sm text-gray-400">Progress</div>
              <div className="text-lg font-bold text-white">
                {completedPieces} / {pieces.length} pieces
              </div>
            </div>
            <div className="w-32 h-2 bg-gray-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-500 transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
            {progress === 100 && (
              <div className="flex items-center gap-2 text-green-400">
                <Check className="w-5 h-5" />
                <span>Complete! - {formatTime(gameState.timer)}</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Main puzzle area */}
      <div className="flex-1 relative">
        <div ref={mountRef} className="w-full h-full" />

        {/* Camera controls overlay */}
        <div className="absolute right-4 top-4 flex flex-col gap-2">
          <button
            onClick={handleZoomIn}
            className="p-2 bg-gray-800 text-white rounded-lg hover:bg-gray-700"
            title="Zoom In"
          >
            <ZoomIn className="w-5 h-5" />
          </button>
          <button
            onClick={handleZoomOut}
            className="p-2 bg-gray-800 text-white rounded-lg hover:bg-gray-700"
            title="Zoom Out"
          >
            <ZoomOut className="w-5 h-5" />
          </button>
          <button
            onClick={handleResetView}
            className="p-2 bg-gray-800 text-white rounded-lg hover:bg-gray-700"
            title="Reset View"
          >
            <Maximize2 className="w-5 h-5" />
          </button>
          <button
            onClick={() => setShowThumbnail(!showThumbnail)}
            className="p-2 bg-gray-800 text-white rounded-lg hover:bg-gray-700"
            title="Toggle Reference Image"
          >
            <Image className="w-5 h-5" />
          </button>
        </div>

        {/* Loading overlay */}
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

        {/* Thumbnail overlay */}
        {showThumbnail && gameState.imageUrl && (
          <div className="absolute left-4 top-4 p-2 bg-gray-800 rounded-lg shadow-lg">
            <img
              src={gameState.imageUrl}
              alt="Reference"
              className="w-48 h-auto rounded border border-gray-600"
            />
          </div>
        )}

        {/* Players list */}
        {ui.showPlayers && (
          <div className="absolute right-4 top-16 bg-gray-800 p-4 rounded-lg shadow-lg w-64">
            <h3 className="text-white font-semibold mb-4">Players</h3>
            <div className="space-y-2">
              {Object.values(players).map(player => (
                <div 
                  key={player.id}
                  className="flex items-center gap-2 p-2 bg-gray-700 rounded"
                >
                  <div 
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: player.color }}
                  />
                  <span className="text-white">{player.name}</span>
                  <span className="ml-auto text-white">{player.score || 0}</span>
                  {player.isHost && (
                    <span className="text-xs bg-blue-500 text-white px-2 py-1 rounded">
                      Host
                    </span>
                  )}
                </div>
              ))}
            </div>
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
              <p className="mb-4">Time: {formatTime(gameState.timer)}</p>
              <button
                onClick={() => {
                  setWinner(null);
                  setShowShareModal(true);
                }}
                className="w-full p-2 bg-blue-500 text-white rounded hover:bg-blue-600"
              >
                Share Result
              </button>
              <button
                onClick={() => setWinner(null)}
                className="mt-2 w-full p-2 border border-gray-300 rounded hover:bg-gray-50"
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
                      `I just completed a ${gameState.difficulty}x${gameState.difficulty} 3D puzzle in ${formatTime(gameState.timer)}!`
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
                      `I just completed a ${gameState.difficulty}x${gameState.difficulty} 3D puzzle in ${formatTime(gameState.timer)}! #3DPuzzle`
                    );
                    window.open(`https://twitter.com/intent/tweet?url=${url}&text=${text}`, '_blank');
                  }}
                  className="w-full p-3 bg-sky-400 text-white rounded hover:bg-sky-500"
                >
                  Share on Twitter
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
                  <Download className="w-4 h-4" /> Download Screenshot
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