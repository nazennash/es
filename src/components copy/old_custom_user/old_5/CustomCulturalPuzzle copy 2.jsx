import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass';
import { Camera, Check, Info, Clock, ZoomIn, ZoomOut, Maximize2, RotateCcw, Image, Play, Pause, Share2, Download } from 'lucide-react';
import html2canvas from 'html2canvas';
import { getAuth } from 'firebase/auth';
import { getDatabase, ref, update } from 'firebase/database';

import elephant from '../assets/elephant.png';
import pyramid from '../assets/pyramid.png';
import african from '../assets/african.png';

// Initialize Firebase services
const auth = getAuth();
const database = getDatabase();

const PUZZLE_IMAGES = [
  { id: 'elephant', src: elephant, title: 'African Elephant', description: 'Majestic elephant in its natural habitat' },
  { id: 'pyramid', src: pyramid, title: 'Egyptian Pyramid', description: 'Ancient pyramids of Giza' },
  { id: 'african', src: african, title: 'African Culture', description: 'Traditional African cultural scene' }
];

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

// Sound System Class
class SoundSystem {
  constructor() {
    if (typeof AudioContext !== 'undefined' || typeof webkitAudioContext !== 'undefined') {
      this.context = new (window.AudioContext || window.webkitAudioContext)();
      this.sounds = {};
      this.enabled = true;
    } else {
      console.warn('AudioContext not supported');
      this.enabled = false;
    }
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
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    
    // Create a default texture or load it asynchronously
    const texture = new THREE.TextureLoader().load(
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII='
    );
    material.map = texture;
    
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

// Shader for puzzle pieces
const puzzlePieceShader = {
  vertexShader: `
    varying vec2 vUv;
    varying vec3 vNormal;
    uniform vec2 uvOffset;
    uniform vec2 uvScale;
    
    void main() {
      vUv = uvOffset + (uv * uvScale);
      vNormal = normalMatrix * normal;
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

// Add cultural highlight effect
const culturalHighlightEffect = {
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform float time;
    uniform vec3 culturalColor;
    varying vec2 vUv;
    
    void main() {
      float pattern = sin(vUv.x * 10.0 + time) * sin(vUv.y * 10.0 + time) * 0.5 + 0.5;
      vec3 color = culturalColor * pattern;
      gl_FragColor = vec4(color, pattern * 0.3);
    }
  `
};

const PuzzleGame = () => {
  // Add gameId state
  const [gameId, setGameId] = useState(null);
  // State management
  const [image, setImage] = useState(null);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [completedPieces, setCompletedPieces] = useState(0);
  const [totalPieces, setTotalPieces] = useState(0);
  const [timeElapsed, setTimeElapsed] = useState(0);
  const [isTimerRunning, setIsTimerRunning] = useState(false);
  const [gameState, setGameState] = useState('initial'); // 'initial', 'playing', 'paused'
  const [showThumbnail, setShowThumbnail] = useState(false);
  const [selectedImage, setSelectedImage] = useState(null);
  const [showShareModal, setShowShareModal] = useState(false);
  const [startTime, setStartTime] = useState(null);
  const [difficulty, setDifficulty] = useState('medium');

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
  const puzzleContainerRef = useRef(null);

  const defaultCameraPosition = { x: 0, y: 0, z: 5 };
  const defaultControlsTarget = new THREE.Vector3(0, 0, 0);

  // Timer formatting
  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Game state management
  const startGame = () => {
    setGameState('playing');
    setIsTimerRunning(true);
    setStartTime(Date.now());
  };

  const updateGameState = useCallback(async (newState) => {
    if (!gameId) return;
    
    try {
      await update(ref(database, `games/${gameId}`), {
        ...newState,
        lastUpdated: Date.now()
      });
    } catch (error) {
      console.error('Error updating game state:', error);
    }
  }, [gameId]);
  
  // Then modify the togglePause function to use it
  const togglePause = useCallback(() => {
    if (gameState === 'playing') {
      setGameState('paused');
      setIsTimerRunning(false);
      updateGameState({ state: 'paused' });
    } else if (gameState === 'paused') {
      setGameState('playing');
      setIsTimerRunning(true);
      updateGameState({ state: 'playing' });
    }
  }, [gameState, updateGameState]);

  // Camera controls
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
    setIsTimerRunning(true);
    
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

    handleResetView();
  };

  // Create placement guides
  const createPlacementGuides = (gridSize, pieceSize) => {
    guideOutlinesRef.current.forEach(guide => sceneRef.current.remove(guide));
    guideOutlinesRef.current = [];

    for (let y = 0; y < gridSize.y; y++) {
      for (let x = 0; x < gridSize.x; x++) {
        const outlineGeometry = new THREE.EdgesGeometry(
          new THREE.PlaneGeometry(pieceSize.x * 0.95, pieceSize.y * 0.95) // Changed from 0.95 to 1.9
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

  // Create puzzle pieces
  const createPuzzlePieces = async (imageUrl) => {
    if (!sceneRef.current || !imageUrl) {
      console.error('Scene or image URL not available');
      return;
    }

    setLoading(true);
    try {
      // Clear existing pieces
      puzzlePiecesRef.current.forEach(piece => {
        sceneRef.current.remove(piece);
      });
      puzzlePiecesRef.current = [];

      const texture = await new Promise((resolve, reject) => {
        new THREE.TextureLoader().load(
          imageUrl,
          (tex) => {
            tex.minFilter = THREE.LinearFilter;
            tex.magFilter = THREE.LinearFilter;
            resolve(tex);
          },
          undefined,
          reject
        );
      });

      const aspectRatio = texture.image.width / texture.image.height;
      const currentDifficulty = DIFFICULTY_SETTINGS[difficulty] || DIFFICULTY_SETTINGS.medium;
      const gridSize = currentDifficulty.grid;
      
      // Calculate piece sizes maintaining aspect ratio
      const totalWidth = 6; // Base width in world units
      const pieceSize = {
        x: totalWidth / gridSize.x,
        y: (totalWidth / aspectRatio) / gridSize.y
      };

      setTotalPieces(gridSize.x * gridSize.y);
      createPlacementGuides(gridSize, pieceSize);

      // Create puzzle pieces with proper positioning
      for (let y = 0; y < gridSize.y; y++) {
        for (let x = 0; x < gridSize.x; x++) {
          const geometry = new THREE.PlaneGeometry(
            pieceSize.x * 0.95,
            pieceSize.y * 0.95
          );

          const material = new THREE.ShaderMaterial({
            uniforms: {
              map: { value: texture },
              uvOffset: { value: new THREE.Vector2(x / gridSize.x, y / gridSize.y) },
              uvScale: { value: new THREE.Vector2(1 / gridSize.x, 1 / gridSize.y) },
              selected: { value: 0.0 },
              correctPosition: { value: 0.0 },
              time: { value: 0.0 }
            },
            vertexShader: puzzlePieceShader.vertexShader,
            fragmentShader: puzzlePieceShader.fragmentShader,
            side: THREE.DoubleSide,
            transparent: true
          });

          const piece = new THREE.Mesh(geometry, material);
          
          // Calculate initial position
          const startX = (x - (gridSize.x - 1) / 2) * pieceSize.x;
          const startY = (y - (gridSize.y - 1) / 2) * pieceSize.y;
          
          piece.position.set(startX, startY, 0);
          piece.userData.originalPosition = piece.position.clone();
          piece.userData.gridPosition = { x, y };
          piece.userData.isPlaced = false;

          sceneRef.current.add(piece);
          puzzlePiecesRef.current.push(piece);
        }
      }

      // Scramble pieces with better distribution
      const scrambleRadius = Math.max(totalWidth, totalWidth / aspectRatio);
      puzzlePiecesRef.current.forEach(piece => {
        const angle = Math.random() * Math.PI * 2;
        const radius = scrambleRadius * (0.5 + Math.random() * 0.5);
        piece.position.x += Math.cos(angle) * radius;
        piece.position.y += Math.sin(angle) * radius;
        piece.position.z = Math.random() * 0.5;
        piece.rotation.z = Math.random() * Math.PI * 2;
      });

      // Adjust camera to fit puzzle
      if (cameraRef.current) {
        const maxDim = Math.max(totalWidth, totalWidth / aspectRatio) * 1.2;
        cameraRef.current.position.z = maxDim;
        cameraRef.current.updateProjectionMatrix();
      }

      setImage(imageUrl);
      setGameState('initial');
      setTimeElapsed(0);
      setProgress(0);
      setCompletedPieces(0);
    } catch (error) {
      console.error('Error creating puzzle pieces:', error);
      setLoading(false);
    }
  };

  // Initialize Three.js scene
  useEffect(() => {
    if (!containerRef.current) return;

    // Scene setup
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1a1a1a);
    sceneRef.current = scene;

    // Camera setup with better initial position
    const camera = new THREE.PerspectiveCamera(
      60,
      containerRef.current.clientWidth / containerRef.current.clientHeight,
      0.1,
      1000
    );
    camera.position.z = 8;
    cameraRef.current = camera;

    // Enhanced lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
    directionalLight.position.set(5, 5, 7);
    scene.add(directionalLight);

    // Improved renderer settings
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: "high-performance"
    });
    renderer.setSize(containerRef.current.clientWidth, containerRef.current.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputEncoding = THREE.sRGBEncoding;
    containerRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Post-processing
    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    composer.addPass(new UnrealBloomPass(
      new THREE.Vector2(window.innerWidth, window.innerHeight),
      0.5, // Bloom strength
      0.4, // Radius
      0.85 // Threshold
    ));
    composerRef.current = composer;

    // Controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.maxDistance = 10;
    controls.minDistance = 2;
    controlsRef.current = controls;

    // Particle system
    particleSystemRef.current = new ParticleSystem(scene);

    // Animation loop
    const animate = () => {
      requestAnimationFrame(animate);
      
      const deltaTime = clockRef.current.getDelta();
      
      // Update controls
      controls.update();
      
      // Update particles
      particleSystemRef.current.update(deltaTime);
      
      // Update shader uniforms
      puzzlePiecesRef.current.forEach(piece => {
        if (piece.material.uniforms) {
          piece.material.uniforms.time.value = clockRef.current.getElapsedTime();
        }
      });
      
      // Render scene
      composer.render();
    };
    animate();

    // Handle window resize
    const handleResize = () => {
      if (!containerRef.current || !cameraRef.current || !rendererRef.current) return;
      
      const width = containerRef.current.clientWidth;
      const height = containerRef.current.clientHeight;
      
      cameraRef.current.aspect = width / height;
      cameraRef.current.updateProjectionMatrix();
      
      rendererRef.current.setSize(width, height);
      composerRef.current?.setSize(width, height);
    };

    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      renderer.dispose();
      containerRef.current?.removeChild(renderer.domElement);
    };
  }, []);

  // Timer effect
  useEffect(() => {
    if (!isTimerRunning) return;

    const interval = setInterval(() => {
      setTimeElapsed(prev => prev + 1);
    }, 1000);

    return () => clearInterval(interval);
  }, [isTimerRunning]);

  // Stop timer when puzzle is complete
  useEffect(() => {
    if (progress === 100) {
      setIsTimerRunning(false);
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
      setShowShareModal(true);
    }
  }, [progress]);

  // Move handleMouseMove outside of the useEffect and define it at component level
  const handleMouseMove = useCallback((event, raycaster, dragPlane, isDragging) => {
    if (!isDragging || !selectedPieceRef.current || !rendererRef.current) return;

    const rect = rendererRef.current.domElement.getBoundingClientRect();
    const mouse = new THREE.Vector2(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1
    );

    raycaster.setFromCamera(mouse, cameraRef.current);
    const intersectPoint = new THREE.Vector3();
    raycaster.ray.intersectPlane(dragPlane, intersectPoint);
    
    selectedPieceRef.current.position.copy(intersectPoint);
    
    const originalPos = selectedPieceRef.current.userData.originalPosition;
    const distance = originalPos.distanceTo(selectedPieceRef.current.position);
    const snapThreshold = DIFFICULTY_SETTINGS[difficulty]?.snapDistance || 0.3;
    
    if (distance < snapThreshold) {
      selectedPieceRef.current.material.uniforms.correctPosition.value = 
        1.0 - (distance / snapThreshold);
    } else {
      selectedPieceRef.current.material.uniforms.correctPosition.value = 0.0;
    }
  }, [difficulty]);

  // Modify the piece movement effect
  useEffect(() => {
    if (!rendererRef.current) return;

    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();
    let isDragging = false;
    let dragPlane = new THREE.Plane();
    
    const handleMouseDown = (event) => {
      event.preventDefault();
      
      const rect = rendererRef.current.domElement.getBoundingClientRect();
      mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(mouse, cameraRef.current);
      const intersects = raycaster.intersectObjects(puzzlePiecesRef.current);

      if (intersects.length > 0) {
        isDragging = true;
        selectedPieceRef.current = intersects[0].object;
        controlsRef.current.enabled = false;

        selectedPieceRef.current.material.uniforms.selected.value = 1.0;
        
        const normal = new THREE.Vector3(0, 0, 1);
        dragPlane.setFromNormalAndCoplanarPoint(
          normal,
          selectedPieceRef.current.position
        );
      }
    };

    const handleMouseMoveWrapper = (event) => {
      handleMouseMove(event, raycaster, dragPlane, isDragging);
    };

    const handleMouseUp = () => {
      if (!selectedPieceRef.current) return;

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
          handlePieceComplete(selectedPieceRef.current);
        }
      }

      selectedPieceRef.current.material.uniforms.selected.value = 0.0;
      selectedPieceRef.current.material.uniforms.correctPosition.value = 
        selectedPieceRef.current.userData.isPlaced ? 1.0 : 0.0;
      
      selectedPieceRef.current = null;
      isDragging = false;
      controlsRef.current.enabled = true;
    };

    const element = rendererRef.current.domElement;
    element.addEventListener('mousedown', handleMouseDown);
    element.addEventListener('mousemove', handleMouseMoveWrapper);
    element.addEventListener('mouseup', handleMouseUp);
    element.addEventListener('mouseleave', handleMouseUp);

    return () => {
      element.removeEventListener('mousedown', handleMouseDown);
      element.removeEventListener('mousemove', handleMouseMoveWrapper);
      element.removeEventListener('mouseup', handleMouseUp);
      element.removeEventListener('mouseleave', handleMouseUp);
    };
  }, [handleMouseMove, totalPieces]);

  // Handle image upload
  const handleImageUpload = (event) => {
    const file = event.target.files[0];
    if (!file) return;

    setLoading(true);
    const reader = new FileReader();
    reader.onload = (e) => {
      setImage(e.target.result);
      createPuzzlePieces(e.target.result).then(() => {
        setLoading(false);
        setIsTimerRunning(false);
        setCompletedPieces(0);
        setProgress(0);
      });
    };
    reader.readAsDataURL(file);
  };

  const capturePuzzleImage = async () => {
    if (!puzzleContainerRef.current) return null;
    try {
      const canvas = await html2canvas(puzzleContainerRef.current);
      return canvas.toDataURL('image/png');
    } catch (err) {
      console.error('Failed to capture puzzle image:', err);
      return null;
    }
  };

  const downloadPuzzleImage = async () => {
    const imageData = await capturePuzzleImage();
    if (!imageData) return;

    const link = document.createElement('a');
    link.href = imageData;
    link.download = `cultural-puzzle-${selectedImage?.title || 'untitled'}-${Date.now()}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const shareToFacebook = () => {
    const url = encodeURIComponent(window.location.href);
    const text = encodeURIComponent(`I just completed the ${selectedImage?.title || 'cultural'} puzzle in ${formatTime(timeElapsed)}! Try this amazing puzzle game!`);
    window.open(`https://www.facebook.com/sharer/sharer.php?u=${url}&quote=${text}`, '_blank');
  };

  const shareToTwitter = () => {
    const url = encodeURIComponent(window.location.href);
    const text = encodeURIComponent(`I just completed the ${selectedImage?.title || 'cultural'} puzzle in ${formatTime(timeElapsed)}! #PuzzleGame #Culture`);
    window.open(`https://twitter.com/intent/tweet?url=${url}&text=${text}`, '_blank');
  };

  const shareToWhatsApp = () => {
    const url = encodeURIComponent(window.location.href);
    const text = encodeURIComponent(`I just completed the ${selectedImage?.title || 'cultural'} puzzle in ${formatTime(timeElapsed)}! Try it here: `);
    window.open(`https://wa.me/?text=${text}%20${url}`, '_blank');
  };

  const ShareModal = () => (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white p-6 rounded-lg shadow-xl max-w-md w-full">
        <h3 className="text-xl font-bold mb-4">Share Your Achievement</h3>
        <div className="space-y-4">
          <button
            onClick={shareToFacebook}
            className="w-full p-3 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Share on Facebook
          </button>
          <button
            onClick={shareToTwitter}
            className="w-full p-3 bg-sky-400 text-white rounded hover:bg-sky-500"
          >
            Share on Twitter
          </button>
          <button
            onClick={shareToWhatsApp}
            className="w-full p-3 bg-green-500 text-white rounded hover:bg-green-600"
          >
            Share on WhatsApp
          </button>
          <button
            onClick={downloadPuzzleImage}
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

  // Add it to piece completion
  const handlePieceComplete = (piece) => {
    const highlightMesh = new THREE.Mesh(
      piece.geometry.clone(),
      new THREE.ShaderMaterial({
        vertexShader: culturalHighlightEffect.vertexShader,
        fragmentShader: culturalHighlightEffect.fragmentShader,
        uniforms: {
          time: { value: 0 },
          culturalColor: { value: new THREE.Color(0.8, 0.6, 0.2) }
        },
        transparent: true,
        blending: THREE.AdditiveBlending
      })
    );
    
    highlightMesh.position.copy(piece.position);
    highlightMesh.position.z += 0.01;
    sceneRef.current.add(highlightMesh);
    
    // Animate and remove after 2 seconds
    setTimeout(() => {
      sceneRef.current.remove(highlightMesh);
    }, 2000);
  };

  // Add game completion handler
  const handlePuzzleCompletion = async (completionData) => {
    if (!auth.currentUser) return;

    try {
      const newGameId = `game_${Date.now()}`;
      setGameId(newGameId);

      await update(ref(database, `games/${newGameId}`), {
        ...completionData,
        completedAt: Date.now(),
        achievements: calculateAchievements(completionData)
      });
    } catch (error) {
      console.error('Error saving game completion:', error);
    }
  };

  // Add achievement calculator
  const calculateAchievements = (data) => {
    const earned = [];
    
    if (data.timer < 120) { // 2 minutes
      earned.push('speed_demon');
    }
    if (data.difficulty === 'expert') {
      earned.push('persistent');
    }
    // Add more achievement checks as needed
    
    return earned;
  };

  // Add completion handler
  useEffect(() => {
    if (progress === 100 && auth.currentUser) {
      const selectedPuzzle = PUZZLE_IMAGES.find(img => img.src === selectedImage);
      handlePuzzleCompletion({
        puzzleId: `cultural_${selectedPuzzle?.id || Date.now()}`,
        userId: auth.currentUser.uid,
        playerName: auth.currentUser.displayName || 'Anonymous',
        startTime,
        difficulty,
        imageUrl: selectedImage,
        timer: timeElapsed
      });
    }
  }, [progress, auth.currentUser, selectedImage, startTime, difficulty, timeElapsed]);

  return (
    <div className="w-full h-screen flex flex-col bg-gray-900">
      {!selectedImage ? (
        <div className="flex-1 p-8">
          <h2 className="text-2xl font-bold text-white mb-6">Select a Puzzle Image</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {PUZZLE_IMAGES.map((image) => (
              <div
                key={image.id}
                className="bg-gray-800 rounded-lg overflow-hidden cursor-pointer transform transition-transform hover:scale-105"
                onClick={() => {
                  setSelectedImage(image.src);
                  createPuzzlePieces(image.src).then(() => {
                    setLoading(false);
                    setIsTimerRunning(false);
                    setCompletedPieces(0);
                    setProgress(0);
                  });
                }}
              >
                <img
                  src={image.src}
                  alt={image.title}
                  className="w-full h-48 object-cover"
                />
                <div className="p-4">
                  <h3 className="text-xl font-semibold text-white">{image.title}</h3>
                  <p className="text-gray-400 mt-2">{image.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <>
          {/* Header with controls */}
          <div className="p-4 bg-gray-800 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button
                onClick={() => {
                  setSelectedImage(null);
                  setGameState('initial');
                }}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 
                          rounded-lg text-white transition-colors"
              >
                <Image className="w-5 h-5" />
                <span>Change Image</span>
              </button>
              
              {/* Rest of the header controls */}
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
            </div>

            {/* Progress indicator */}
            {totalPieces > 0 && (
              <div className="flex items-center gap-4">
                <div className="flex flex-col items-end">
                  <div className="text-sm text-gray-400">Progress</div>
                  <div className="text-lg font-bold text-white">
                    {completedPieces} / {totalPieces} pieces
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
                    <span>Complete! - {formatTime(timeElapsed)}</span>
                  </div>
                )}
              </div>
            )}
          </div>
        </>
      )}

      {/* Main puzzle area */}
      <div ref={puzzleContainerRef} className="flex-1 relative">
        <div ref={containerRef} className="w-full h-full" />

        {/* Camera controls overlay */}
        <div className="absolute right-4 top-4 flex flex-col gap-2">
          <button
            onClick={handleZoomIn}
            className="p-2 bg-gray-800 text-white rounded-lg hover:bg-gray-700 transition-colors"
            title="Zoom In"
          >
            <ZoomIn className="w-5 h-5" />
          </button>
          <button
            onClick={handleZoomOut}
            className="p-2 bg-gray-800 text-white rounded-lg hover:bg-gray-700 transition-colors"
            title="Zoom Out"
          >
            <ZoomOut className="w-5 h-5" />
          </button>
          <button
            onClick={handleResetView}
            className="p-2 bg-gray-800 text-white rounded-lg hover:bg-gray-700 transition-colors"
            title="Reset View"
          >
            <Maximize2 className="w-5 h-5" />
          </button>
          <button
            onClick={handleResetGame}
            className="p-2 bg-gray-800 text-white rounded-lg hover:bg-gray-700 transition-colors"
            title="Reset Puzzle"
          >
            <RotateCcw className="w-5 h-5" />
          </button>
          <button
            onClick={() => setShowThumbnail(!showThumbnail)}
            className="p-2 bg-gray-800 text-white rounded-lg hover:bg-gray-700 transition-colors"
            title="Toggle Reference Image"
          >
            <Image className="w-5 h-5" />
          </button>
        </div>

        {/* Loading overlay */}
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center 
                        bg-gray-900 bg-opacity-75 z-10">
            <div className="text-xl text-white">Loading puzzle...</div>
          </div>
        )}

        {/* Thumbnail overlay */}
        {showThumbnail && selectedImage && (
          <div className="absolute left-4 top-4 p-2 bg-gray-800 rounded-lg shadow-lg">
            <div className="relative w-48">
              <img
                src={selectedImage}
                alt="Reference"
                className="w-full h-auto rounded border border-gray-600"
              />
              <button
                onClick={() => setShowThumbnail(false)}
                className="absolute -top-2 -right-2 p-1 bg-gray-700 rounded-full text-gray-300 hover:text-white"
              >
                ×
              </button>
            </div>
          </div>
        )}

        {/* ...existing overlays... */}
      </div>
      {showShareModal && <ShareModal />}
    </div>
  );
};

export default PuzzleGame;