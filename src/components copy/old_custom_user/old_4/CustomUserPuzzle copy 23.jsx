import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass';
import { Camera, Check, Info, Clock, Trophy, Settings, Volume2, VolumeX } from 'lucide-react';

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
  { id: 'pe rfectionist', name: 'Perfectionist', description: 'Complete without misplacing pieces', icon: '✨' },
  { id: 'persistent', name: 'Persistent', description: 'Complete on expert difficulty', icon: '🏆' }
];

// Sound effects using Web Audio API
class SoundSystem {
  constructor() {
    this.context = new (window.AudioContext || window.webkitAudioContext)();
    this.sounds = {};
    this.enabled = true;
  }

  async initialize() {
    // Create oscillator-based sound effects
    this.sounds.pickup = this.createToneBuffer(440, 0.1);
    this.sounds.place = this.createToneBuffer(880, 0.15);
    this.sounds.complete = this.createToneBuffer([523.25, 659.25, 783.99], 0.3);
  }

  createToneBuffer(frequency, duration) {
    const sampleRate = this.context.sampleRate;
    const buffer = this.context.createBuffer(1, duration * sampleRate, sampleRate);
    const data = buffer.getChannelData(0);

    // Convert frequency to array if single number
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

// Enhanced particle system with multiple effects
class EnhancedParticleSystem {
  constructor(scene) {
    this.scene = scene;
    this.particleSystems = new Map();
    this.initialize();
  }

  initialize() {
    // Create different particle effects
    this.createParticleSystem('place', {
      size: 0.05,
      count: 30,
      color: 0x4CAF50,
      lifetime: 1.0
    });

    this.createParticleSystem('complete', {
      size: 0.08,
      count: 100,
      color: 0xFFC107,
      lifetime: 2.0
    });

    this.createParticleSystem('trail', {
      size: 0.03,
      count: 50,
      color: 0x2196F3,
      lifetime: 0.5
    });
  }

  createParticleSystem({ size, count, color, lifetime }) {
    const geometry = new THREE.BufferGeometry();
    const material = new THREE.PointsMaterial({
      size,
      map: this.createParticleTexture(),
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      color
    });

    const system = {
      points: new THREE.Points(geometry, material),
      particles: [],
      lifetime
    };

    this.scene.add(system.points);
    return system;
  }

  createParticleTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 32;
    canvas.height = 32;
    const ctx = canvas.getContext('2d');
    
    const gradient = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
    gradient.addColorStop(0, 'rgba(255,255,255,1)');
    gradient.addColorStop(1, 'rgba(255,255,255,0)');
    
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 32, 32);
    
    const texture = new THREE.Texture(canvas);
    texture.needsUpdate = true;
    return texture;
  }

  emit(type, position, options = {}) {
    const system = this.particleSystems.get(type);
    if (!system) return;

    const count = options.count || system.count;
    for (let i = 0; i < count; i++) {
      const velocity = new THREE.Vector3(
        (Math.random() - 0.5) * options.spread || 0.2,
        (Math.random() - 0.5) * options.spread || 0.2,
        Math.random() * options.spread || 0.2
      );

      system.particles.push({
        position: position.clone(),
        velocity,
        life: system.lifetime
      });
    }
  }

  update(deltaTime) {
    this.particleSystems.forEach(system => {
      system.particles = system.particles.filter(particle => {
        particle.life -= deltaTime;
        particle.position.add(particle.velocity.multiplyScalar(deltaTime));
        return particle.life > 0;
      });

      const positions = new Float32Array(system.particles.length * 3);
      system.particles.forEach((particle, i) => {
        positions[i * 3] = particle.position.x;
        positions[i * 3 + 1] = particle.position.y;
        positions[i * 3 + 2] = particle.position.z;
      });

      system.points.geometry.setAttribute(
        'position',
        new THREE.BufferAttribute(positions, 3)
      );
    });
  }
}

// Custom shader for puzzle piece material with relief effect
// const puzzlePieceShader = {
//   vertexShader: `
//     varying vec2 vUv;
//     varying vec3 vNormal;
//     varying vec3 vViewPosition;
    
//     uniform vec2 uvOffset;
//     uniform vec2 uvScale;
//     uniform sampler2D heightMap;
//     uniform float extrusionScale;
//     uniform float time;
    
//     void main() {
//       vUv = uvOffset + uv * uvScale;
      
//       // Sample height map for vertex displacement
//       vec4 heightColor = texture2D(heightMap, vUv);
//       float height = (heightColor.r + heightColor.g + heightColor.b) / 3.0;
      
//       // Add subtle wave animation to unplaced pieces
//       float wave = sin(position.x * 5.0 + time) * 0.05 * (1.0 - heightColor.a);
      
//       // Calculate displaced position
//       vec3 newPosition = position;
//       newPosition.z += height * extrusionScale + wave;
      
//       // Calculate normal for lighting
//       float eps = 0.01;
//       float heightU = texture2D(heightMap, vUv + vec2(eps, 0.0)).r;
//       float heightV = texture2D(heightMap, vUv + vec2(0.0, eps)).r;
      
//       vec3 normal = normalize(vec3(
//         (height - heightU) / eps,
//         (height - heightV) / eps,
//         1.0
//       ));
      
//       vNormal = normalMatrix * normal;
//       vec4 mvPosition = modelViewMatrix * vec4(newPosition, 1.0);
//       vViewPosition = -mvPosition.xyz;
//       gl_Position = projectionMatrix * mvPosition;
//     }
//   `,
//   fragmentShader: `
//     uniform sampler2D map;
//     uniform float selected;
//     uniform float correctPosition;
//     uniform float time;
    
//     varying vec2 vUv;
//     varying vec3 vNormal;
//     varying vec3 vViewPosition;
    
//     void main() {
//       vec4 texColor = texture2D(map, vUv);
      
//       // Basic lighting
//       vec3 normal = normalize(vNormal);
//       vec3 viewDir = normalize(vViewPosition);
      
//       // Key light
//       vec3 lightPos = vec3(5.0, 5.0, 5.0);
//       vec3 lightDir = normalize(lightPos);
//       float diff = max(dot(normal, lightDir), 0.0);
      
//       // Rim light
//       float rimStrength = 1.0 - max(dot(viewDir, normal), 0.0);
//       rimStrength = pow(rimStrength, 3.0);
      
//       // Selection highlight
//       vec3 highlightColor = vec3(0.3, 0.6, 1.0);
//       float highlightStrength = selected * 0.5 * (0.5 + 0.5 * sin(time * 3.0));
      
//       // Correct position glow
//       vec3 correctColor = vec3(0.2, 1.0, 0.3);
//       float correctStrength = correctPosition * 0.5 * (0.5 + 0.5 * sin(time * 2.0));
      
//       // Combine lighting
//       vec3 ambient = vec3(0.3);
//       vec3 diffuse = vec3(0.7) * diff;
//       vec3 rim = vec3(0.5) * rimStrength;
      
//       vec3 finalColor = texColor.rgb * (ambient + diffuse) + rim;
//       finalColor += highlightColor * highlightStrength + correctColor * correctStrength;
      
//       gl_FragColor = vec4(finalColor, texColor.a);
//     }
//   `
// };

// Replace the existing puzzlePieceShader object with this simpler version
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
      
      // Basic lighting
      vec3 normal = normalize(vNormal);
      vec3 lightDir = normalize(vec3(5.0, 5.0, 5.0));
      float diff = max(dot(normal, lightDir), 0.0);
      
      // Selection highlight
      vec3 highlightColor = vec3(0.3, 0.6, 1.0);
      float highlightStrength = selected * 0.5 * (0.5 + 0.5 * sin(time * 3.0));
      
      // Correct position glow
      vec3 correctColor = vec3(0.2, 1.0, 0.3);
      float correctStrength = correctPosition * 0.5 * (0.5 + 0.5 * sin(time * 2.0));
      
      // Combine lighting
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

const PuzzleGame = () => {
  const containerRef = useRef(null);
  const [image, setImage] = useState(null);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [completedPieces, setCompletedPieces] = useState(0);
  const [totalPieces, setTotalPieces] = useState(0);
  
  // Three.js references
  const sceneRef = useRef(null);
  const cameraRef = useRef(null);
  const rendererRef = useRef(null);
  const composerRef = useRef(null);
  const controlsRef = useRef(null);
  const clockRef = useRef(new THREE.Clock());
  const particleSystemRef = useRef(null);
  const puzzlePiecesRef = useRef([]);
  const selectedPieceRef = useRef(null);
  
  // Initialize Three.js scene
  useEffect(() => {
    if (!containerRef.current) return;

    // Scene setup
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1a1a1a);
    sceneRef.current = scene;

    // Camera setup
    const camera = new THREE.PerspectiveCamera(
      75,
      containerRef.current.clientWidth / containerRef.current.clientHeight,
      0.1,
      1000
    );
    camera.position.z = 5;
    cameraRef.current = camera;

    // Renderer setup
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true
    });
    renderer.setSize(containerRef.current.clientWidth, containerRef.current.clientHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
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

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(5, 5, 5);
    scene.add(directionalLight);

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

    // Cleanup
    return () => {
      renderer.dispose();
      containerRef.current?.removeChild(renderer.domElement);
    };
  }, []);

  // Create puzzle pieces
  const createPuzzlePieces = async (imageUrl) => {
    if (!sceneRef.current) return;

    // Clear existing pieces
    puzzlePiecesRef.current.forEach(piece => {
      sceneRef.current.remove(piece);
    });
    puzzlePiecesRef.current = [];

    const texture = await new THREE.TextureLoader().loadAsync(imageUrl);
    const aspectRatio = texture.image.width / texture.image.height;
    
    // Define puzzle grid
    const gridSize = { x: 4, y: 3 };
    setTotalPieces(gridSize.x * gridSize.y);
    
    const pieceSize = {
      x: 1 * aspectRatio / gridSize.x,
      y: 1 / gridSize.y
    };

    // Generate pieces
    for (let y = 0; y < gridSize.y; y++) {
      for (let x = 0; x < gridSize.x; x++) {
        // Create detailed geometry for relief effect
        const geometry = new THREE.PlaneGeometry(
          pieceSize.x * 0.95,
          pieceSize.y * 0.95,
          32,
          32
        );

        // Create material with custom shader
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
        
        // Set initial position
        piece.position.x = (x - gridSize.x / 2 + 0.5) * pieceSize.x;
        piece.position.y = (y - gridSize.y / 2 + 0.5) * pieceSize.y;
        piece.position.z = 0;

        // Store metadata
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
  };

  // Handle piece selection and movement
  useEffect(() => {
    if (!rendererRef.current) return;

    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();
    let isDragging = false;
    let dragPlane = new THREE.Plane();
    
    const handleMouseDown = (event) => {
      event.preventDefault();
      
      // Update mouse coordinates
      const rect = rendererRef.current.domElement.getBoundingClientRect();
      mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

      // Check for intersection with pieces
      raycaster.setFromCamera(mouse, cameraRef.current);
      const intersects = raycaster.intersectObjects(puzzlePiecesRef.current);

      if (intersects.length > 0) {
        isDragging = true;
        selectedPieceRef.current = intersects[0].object;
        controlsRef.current.enabled = false;

        // Update selection shader uniform
        selectedPieceRef.current.material.uniforms.selected.value = 1.0;
        
        // Create drag plane
        const normal = new THREE.Vector3(0, 0, 1);
        dragPlane.setFromNormalAndCoplanarPoint(
          normal,
          selectedPieceRef.current.position
        );
      }
    };

    const handleMouseMove = (event) => {
      if (!isDragging || !selectedPieceRef.current) return;

      // Update mouse position
      const rect = rendererRef.current.domElement.getBoundingClientRect();
      mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

      // Update piece position
      raycaster.setFromCamera(mouse, cameraRef.current);
      const intersectPoint = new THREE.Vector3();
      raycaster.ray.intersectPlane(dragPlane, intersectPoint);
      
      // Move piece
      selectedPieceRef.current.position.copy(intersectPoint);
      
      // Check proximity to correct position
      const originalPos = selectedPieceRef.current.userData.originalPosition;
      const distance = originalPos.distanceTo(selectedPieceRef.current.position);
      
      // Visual feedback for proximity
      if (distance < 0.3) {
        selectedPieceRef.current.material.uniforms.correctPosition.value = 
          1.0 - (distance / 0.3);
      } else {
        selectedPieceRef.current.material.uniforms.correctPosition.value = 0.0;
      }
    };

    const handleMouseUp = () => {
      if (!selectedPieceRef.current) return;

      // Check if piece is close to its correct position
      const originalPos = selectedPieceRef.current.userData.originalPosition;
      const distance = originalPos.distanceTo(selectedPieceRef.current.position);

      if (distance < 0.3) {
        // Snap to correct position
        selectedPieceRef.current.position.copy(originalPos);
        selectedPieceRef.current.rotation.z = 0;
        
        if (!selectedPieceRef.current.userData.isPlaced) {
          // Mark as placed and update progress
          selectedPieceRef.current.userData.isPlaced = true;
          setCompletedPieces(prev => {
            const newCount = prev + 1;
            setProgress((newCount / totalPieces) * 100);
            return newCount;
          });

          // Emit particles for celebration
          particleSystemRef.current.emit(selectedPieceRef.current.position, 30);
        }
      }

      // Reset selection state
      selectedPieceRef.current.material.uniforms.selected.value = 0.0;
      selectedPieceRef.current.material.uniforms.correctPosition.value = 
        selectedPieceRef.current.userData.isPlaced ? 1.0 : 0.0;
      
      selectedPieceRef.current = null;
      isDragging = false;
      controlsRef.current.enabled = true;
    };

    const element = rendererRef.current.domElement;
    element.addEventListener('mousedown', handleMouseDown);
    element.addEventListener('mousemove', handleMouseMove);
    element.addEventListener('mouseup', handleMouseUp);
    element.addEventListener('mouseleave', handleMouseUp);

    return () => {
      element.removeEventListener('mousedown', handleMouseDown);
      element.removeEventListener('mousemove', handleMouseMove);
      element.removeEventListener('mouseup', handleMouseUp);
      element.removeEventListener('mouseleave', handleMouseUp);
    };
  }, [totalPieces]);

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
        setCompletedPieces(0);
        setProgress(0);
      });
    };
    reader.readAsDataURL(file);
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
                <span>Complete!</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Main puzzle area */}
      <div ref={containerRef} className="flex-1 relative">
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center 
                        bg-gray-900 bg-opacity-75 z-10">
            <div className="text-xl text-white">Loading puzzle...</div>
          </div>
        )}
      </div>
    </div>
  );
};

export default PuzzleGame;