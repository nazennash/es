// ImagePuzzle3D.js
import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { DragControls } from 'three/examples/jsm/controls/DragControls';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass';
import { gsap } from 'gsap';
import confetti from 'canvas-confetti';

// Constants
const GAME_MODES = {
  CLASSIC: 'classic',
  TIME_ATTACK: 'timeAttack',
  MULTIPLAYER: 'multiplayer',
  CHALLENGE: 'challenge'
};

const POWER_UPS = {
  HINT: 'hint',
  AUTO_ALIGN: 'autoAlign',
  EDGE_FINDER: 'edgeFinder',
  COLOR_SORT: 'colorSort'
};

const ACHIEVEMENTS = {
  SPEED_DEMON: {
    id: 'speedDemon',
    title: 'Speed Demon',
    description: 'Complete puzzle in under 3 minutes',
    icon: '⚡'
  },
  PRECISION_MASTER: {
    id: 'precisionMaster',
    title: 'Precision Master',
    description: 'Place 10 pieces perfectly without misplacement',
    icon: '🎯'
  },
  PERSISTENCE: {
    id: 'persistence',
    title: 'Persistence',
    description: 'Complete puzzle after 30+ minutes',
    icon: '🏆'
  }
};

// Styles
const panelClasses = "absolute p-4 bg-blue-900 bg-opacity-80 rounded-lg text-white";
const buttonClasses = "px-4 py-2 rounded text-white transition-colors duration-200";

const ImagePuzzle3D = () => {
  // Refs
  const mountRef = useRef(null);
  const composerRef = useRef(null);
  const playerIdRef = useRef(`player_${Math.random().toString(36).substr(2, 9)}`);
  const imageRef = useRef(null);

  // Three.js state
  const [scene, setScene] = useState(null);
  const [camera, setCamera] = useState(null);
  const [renderer, setRenderer] = useState(null);
  const [pieces, setPieces] = useState([]);
  const [dragControls, setDragControls] = useState(null);
  const [orbitControls, setOrbitControls] = useState(null);

  // Game state
  const [gameMode, setGameMode] = useState(GAME_MODES.CLASSIC);
  const [activePowerUp, setActivePowerUp] = useState(null);
  const [selectedPieces, setSelectedPieces] = useState([]);
  const [gameStats, setGameStats] = useState({
    totalPieces: 0,
    placedPieces: 0,
    startTime: null,
    elapsedTime: 0,
    score: 0,
    accuracy: 100,
    timeLimit: 300,
    timeRemaining: 300,
    movesUsed: 0,
    maxMoves: 100,
    challengeLevel: 1,
    rotationLocked: false
  });

  // UI state
  const [achievements, setAchievements] = useState([]);
  const [players, setPlayers] = useState([]);
  const [showInstructions, setShowInstructions] = useState(true);

  // Utility functions
  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Scene initialization
  const initScene = useCallback(() => {
    if (!mountRef.current) return;

    const container = mountRef.current;
    
    // Scene setup
    const newScene = new THREE.Scene();
    newScene.background = new THREE.Color(0x1a1a2e);
    newScene.fog = new THREE.Fog(0x1a1a2e, 10, 50);

    // Camera setup
    const newCamera = new THREE.PerspectiveCamera(
      75, container.clientWidth / container.clientHeight, 0.1, 1000
    );
    newCamera.position.set(0, 5, 10);

    // Renderer setup
    const newRenderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      precision: 'highp',
      powerPreference: 'high-performance'
    });
    newRenderer.setSize(container.clientWidth, container.clientHeight);
    newRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    newRenderer.shadowMap.enabled = true;
    newRenderer.shadowMap.type = THREE.PCFSoftShadowMap;
    newRenderer.outputEncoding = THREE.sRGBEncoding;
    newRenderer.toneMapping = THREE.ACESFilmicToneMapping;

    // Lighting setup
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    const pointLight = new THREE.PointLight(0x4299e1, 1, 100);
    
    directionalLight.position.set(5, 5, 5);
    pointLight.position.set(0, 10, 0);
    
    [directionalLight, pointLight].forEach(light => {
      light.castShadow = true;
      light.shadow.mapSize.width = 2048;
      light.shadow.mapSize.height = 2048;
      newScene.add(light);
    });
    newScene.add(ambientLight);

    // Post-processing setup
    const composer = new EffectComposer(newRenderer);
    const renderPass = new RenderPass(newScene, newCamera);
    const bloomPass = new UnrealBloomPass(
      new THREE.Vector2(container.clientWidth, container.clientHeight),
      1.5, 0.4, 0.85
    );
    composer.addPass(renderPass);
    composer.addPass(bloomPass);
    composerRef.current = composer;

    // Controls setup
    const newOrbitControls = new OrbitControls(newCamera, newRenderer.domElement);
    newOrbitControls.enableDamping = true;
    newOrbitControls.dampingFactor = 0.05;
    newOrbitControls.maxPolarAngle = Math.PI / 2;

    container.appendChild(newRenderer.domElement);

    setScene(newScene);
    setCamera(newCamera);
    setRenderer(newRenderer);
    setOrbitControls(newOrbitControls);

    return () => {
      window.removeEventListener('resize', handleResize);
      container.removeChild(newRenderer.domElement);
      newRenderer.dispose();
      newRenderer.forceContextLoss();
      composer.dispose();
    };
  }, []);

  // Handle window resize
  const handleResize = useCallback(() => {
    if (!camera || !renderer || !mountRef.current) return;

    const container = mountRef.current;
    const width = container.clientWidth;
    const height = container.clientHeight;

    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
    composerRef.current?.setSize(width, height);
  }, [camera, renderer]);

  // Image upload handler
  const handleImageUpload = useCallback((event) => {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const image = new Image();
      image.onload = () => {
        imageRef.current = image;
        // Clear existing pieces
        pieces.forEach(piece => scene.remove(piece));
        setPieces([]);
        
        // Create new puzzle based on game mode
        const piecesCount = gameMode === GAME_MODES.CHALLENGE 
          ? Math.min(8, 3 + Math.floor(gameStats.challengeLevel / 2))
          : 4;
        
        createPuzzlePieces(image, piecesCount, piecesCount);
        
        setGameStats(prev => ({
          ...prev,
          startTime: Date.now(),
          placedPieces: 0,
          timeRemaining: prev.timeLimit
        }));
      };
      image.src = e.target.result;
    };
    reader.readAsDataURL(file);
  }, [scene, pieces, gameMode, gameStats.challengeLevel]);

  // Create puzzle pieces
  const createPuzzlePieces = useCallback((image, rows = 4, cols = 4) => {
    if (!scene || !camera || !renderer) return;

    const pieceWidth = image.width / cols;
    const pieceHeight = image.height / rows;
    const newPieces = [];
    const geometry = new THREE.BoxGeometry(1, 0.1, 1);

    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        canvas.width = pieceWidth;
        canvas.height = pieceHeight;
        
        context.drawImage(
          image,
          col * pieceWidth,
          row * pieceHeight,
          pieceWidth,
          pieceHeight,
          0,
          0,
          pieceWidth,
          pieceHeight
        );

        const texture = new THREE.CanvasTexture(canvas);
        texture.encoding = THREE.sRGBEncoding;
        
        const materials = [
          new THREE.MeshPhysicalMaterial({
            color: 0x2c5282,
            metalness: 0.5,
            roughness: 0.5,
            clearcoat: 1.0
          }),
          new THREE.MeshPhysicalMaterial({
            color: 0x2c5282,
            metalness: 0.5,
            roughness: 0.5,
            clearcoat: 1.0
          }),
          new THREE.MeshPhysicalMaterial({
            map: texture,
            metalness: 0.1,
            roughness: 0.5,
            clearcoat: 0.5
          }),
          new THREE.MeshPhysicalMaterial({
            color: 0x2c5282,
            metalness: 0.5,
            roughness: 0.5,
            clearcoat: 1.0
          }),
          new THREE.MeshPhysicalMaterial({
            color: 0x2c5282,
            metalness: 0.5,
            roughness: 0.5,
            clearcoat: 1.0
          }),
          new THREE.MeshPhysicalMaterial({
            color: 0x2c5282,
            metalness: 0.5,
            roughness: 0.5,
            clearcoat: 1.0
          })
        ];

        const piece = new THREE.Mesh(geometry, materials);
        piece.position.set(
          (col - cols / 2) * 1.1 + 0.5,
          3,
          (row - rows / 2) * 1.1 + 0.5
        );
        piece.castShadow = true;
        piece.receiveShadow = true;

        piece.userData = {
          correctPosition: new THREE.Vector3(
            (col - cols / 2) * 1.1 + 0.5,
            0,
            (row - rows / 2) * 1.1 + 0.5
          ),
          isPlaced: false,
          row,
          col,
          id: `piece_${row}_${col}`
        };

        scene.add(piece);
        newPieces.push(piece);
      }
    }

    // Initialize drag controls
    const newDragControls = new DragControls(newPieces, camera, renderer.domElement);
    
    newDragControls.addEventListener('dragstart', (event) => {
      orbitControls.enabled = false;
      handlePieceDragStart(event.object);
    });

    newDragControls.addEventListener('drag', (event) => {
      handlePieceDrag(event.object);
    });

    newDragControls.addEventListener('dragend', (event) => {
      orbitControls.enabled = true;
      handlePieceDragEnd(event.object);
    });

    setDragControls(newDragControls);
    setPieces(newPieces);
    setGameStats(prev => ({ ...prev, totalPieces: newPieces.length }));

  }, [scene, camera, renderer, orbitControls]);

  // Piece interaction handlers
  const handlePieceDragStart = useCallback((piece) => {
    gsap.to(piece.position, {
      y: piece.position.y + 0.5,
      duration: 0.2,
      ease: 'power2.out'
    });

    piece.material.forEach(mat => {
      if (mat.color) {
        gsap.to(mat.color, {
          r: 0.4,
          g: 0.6,
          b: 1.0,
          duration: 0.2
        });
      }
    });
  }, []);

  const handlePieceDrag = useCallback((piece) => {
    if (gameMode === GAME_MODES.CHALLENGE && gameStats.rotationLocked) {
      piece.rotation.set(0, 0, 0);
    }

    // Update moves counter for challenge mode
    if (gameMode === GAME_MODES.CHALLENGE) {
      setGameStats(prev => ({
        ...prev,
        movesUsed: prev.movesUsed + 1
      }));
    }
  }, [gameMode, gameStats.rotationLocked]);

  const handlePieceDragEnd = useCallback((piece) => {
    checkPiecePlacement(piece);
  }, []);

  // Piece placement verification
  const checkPiecePlacement = useCallback((piece) => {
    const tolerance = 0.5;
    const correctPos = piece.userData.correctPosition;
    const distance = piece.position.distanceTo(correctPos);

    if (distance < tolerance && !piece.userData.isPlaced) {
      gsap.to(piece.position, {
        x: correctPos.x,
        y: correctPos.y,
        z: correctPos.z,
        duration: 0.3,
        ease: 'power2.out',
        onComplete: () => {
          createPlacementParticles(piece.position);
          piece.userData.isPlaced = true;
          setGameStats(prev => ({
            ...prev,
            placedPieces: prev.placedPieces + 1,
            score: prev.score + (gameMode === GAME_MODES.TIME_ATTACK ? 100 : 0)
          }));
          checkPuzzleCompletion();
        }
      });
    }
  }, []);

  // Particle effects
  const createPlacementParticles = useCallback((position) => {
    if (!scene) return;

    const particleCount = 20;
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(particleCount * 3);
    const colors = new Float32Array(particleCount * 3);

    for (let i = 0; i < particleCount; i++) {
      positions[i * 3] = position.x;
      positions[i * 3 + 1] = position.y;
      positions[i * 3 + 2] = position.z;

      colors[i * 3] = 0.4;
      colors[i * 3 + 1] = 0.6;
      colors[i * 3 + 2] = 1.0;
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const material = new THREE.PointsMaterial({
      size: 0.1,
      vertexColors: true,
      blending: THREE.AdditiveBlending,
      transparent: true
    });

    const particles = new THREE.Points(geometry, material);
    scene.add(particles);

    gsap.to(positions, {
      duration: 1,
      ease: 'power2.out',
      onUpdate: () => {
        for (let i = 0; i < particleCount; i++) {
          positions[i * 3] += (Math.random() - 0.5) * 0.1;
          positions[i * 3 + 1] += Math.random() * 0.1;
          positions[i * 3 + 2] += (Math.random() - 0.5) * 0.1;
        }
        geometry.attributes.position.needsUpdate = true;
      },
      onComplete: () => {
        scene.remove(particles);
        geometry.dispose();
        material.dispose();
      }
    });
  }, [scene]);

  // Game mode handlers
  const initializeGameMode = useCallback((mode) => {
    setGameMode(mode);
    
    const baseStats = {
      totalPieces: 0,
      placedPieces: 0,
      startTime: Date.now(),
      elapsedTime: 0,
      score: 0,
      accuracy: 100
    };
    
    switch (mode) {
      case GAME_MODES.TIME_ATTACK:
        setGameStats({
          ...baseStats,
          timeLimit: 300,
          timeRemaining: 300
        });
        break;
        
      case GAME_MODES.CHALLENGE:
        setGameStats({
          ...baseStats,
          maxMoves: 100,
          movesUsed: 0,
          challengeLevel: 1,
          rotationLocked: false
        });
        break;
        
      default:
        setGameStats(baseStats);
    }

    // Reset puzzle if image exists
    if (imageRef.current) {
      const piecesCount = mode === GAME_MODES.CHALLENGE ? 3 : 4;
      createPuzzlePieces(imageRef.current, piecesCount, piecesCount);
    }
  }, [createPuzzlePieces]);

  // Power-ups implementation
  const handlePowerUp = useCallback((powerUpType) => {
    if (!scene || !pieces.length) return;

    switch (powerUpType) {
      case POWER_UPS.HINT:
        const unplacedPieces = pieces.filter(piece => !piece.userData.isPlaced);
        if (unplacedPieces.length > 0) {
          const randomPiece = unplacedPieces[Math.floor(Math.random() * unplacedPieces.length)];
          const hintMarker = createHintMarker(randomPiece.userData.correctPosition);
          scene.add(hintMarker);
          setTimeout(() => scene.remove(hintMarker), 3000);
        }
        break;

      case POWER_UPS.AUTO_ALIGN:
        pieces.forEach(piece => {
          if (!piece.userData.isPlaced) {
            const distance = piece.position.distanceTo(piece.userData.correctPosition);
            if (distance < 1.5) {
              checkPiecePlacement(piece);
            }
          }
        });
        break;

      case POWER_UPS.EDGE_FINDER:
        const gridSize = Math.sqrt(pieces.length);
        pieces.forEach(piece => {
          const { row, col } = piece.userData;
          if ((row === 0 || row === gridSize - 1 || col === 0 || col === gridSize - 1) && !piece.userData.isPlaced) {
            highlightPiece(piece);
          }
        });
        break;

      case POWER_UPS.COLOR_SORT:
        const unplacedPiecesForSort = pieces.filter(piece => !piece.userData.isPlaced);
        const colorGroups = groupPiecesByColor(unplacedPiecesForSort);
        arrangePiecesByColor(colorGroups);
        break;
    }
    
    setActivePowerUp(powerUpType);
    setTimeout(() => setActivePowerUp(null), 3000);
  }, [scene, pieces]);

  // Power-up helper functions
  const createHintMarker = useCallback((position) => {
    const geometry = new THREE.RingGeometry(0.6, 0.8, 32);
    const material = new THREE.MeshBasicMaterial({
      color: 0x00ff00,
      transparent: true,
      opacity: 0.5,
      side: THREE.DoubleSide
    });
    const marker = new THREE.Mesh(geometry, material);
    marker.position.copy(position);
    marker.rotation.x = -Math.PI / 2;

    gsap.to(marker.scale, {
      x: 1.5,
      y: 1.5,
      z: 1.5,
      duration: 1,
      repeat: -1,
      yoyo: true
    });

    return marker;
  }, []);

  const highlightPiece = useCallback((piece) => {
    const originalMaterials = piece.material.map(m => m.clone());
    
    piece.material.forEach(material => {
      if (material.color) {
        gsap.to(material.color, {
          r: 1,
          g: 0.8,
          b: 0,
          duration: 0.5,
          yoyo: true,
          repeat: 3
        });
      }
    });

    setTimeout(() => {
      piece.material = originalMaterials;
    }, 3000);
  }, []);

  const groupPiecesByColor = useCallback((piecesToGroup) => {
    const groups = {};
    piecesToGroup.forEach(piece => {
      const texture = piece.material[2].map;
      if (!texture) return;

      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      canvas.width = texture.image.width;
      canvas.height = texture.image.height;
      ctx.drawImage(texture.image, 0, 0);
      
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      let r = 0, g = 0, b = 0;
      
      for (let i = 0; i < imageData.length; i += 4) {
        r += imageData[i];
        g += imageData[i + 1];
        b += imageData[i + 2];
      }
      
      const pixels = imageData.length / 4;
      const colorKey = `${Math.round(r/pixels)},${Math.round(g/pixels)},${Math.round(b/pixels)}`;
      
      if (!groups[colorKey]) groups[colorKey] = [];
      groups[colorKey].push(piece);
    });
    
    return groups;
  }, []);

  const arrangePiecesByColor = useCallback((colorGroups) => {
    let offsetX = -5;
    Object.values(colorGroups).forEach(group => {
      group.forEach((piece, index) => {
        gsap.to(piece.position, {
          x: offsetX,
          z: -5 + index,
          duration: 0.5
        });
      });
      offsetX += 2;
    });
  }, []);

  // Check puzzle completion
  const checkPuzzleCompletion = useCallback(() => {
    if (pieces.every(piece => piece.userData.isPlaced)) {
      handlePuzzleComplete();
    }
  }, [pieces]);

  // Handle puzzle completion
  const handlePuzzleComplete = useCallback(() => {
    const endTime = Date.now();
    const timeElapsed = Math.floor((endTime - gameStats.startTime) / 1000);
    
    // Celebration effects
    confetti({
      particleCount: 100,
      spread: 70,
      origin: { y: 0.6 }
    });

    // Check for achievements
    const newAchievements = [];
    
    if (timeElapsed < 180) {
      newAchievements.push(ACHIEVEMENTS.SPEED_DEMON);
    }
    if (gameStats.accuracy === 100 && gameStats.totalPieces >= 10) {
      newAchievements.push(ACHIEVEMENTS.PRECISION_MASTER);
    }
    if (timeElapsed > 1800) {
      newAchievements.push(ACHIEVEMENTS.PERSISTENCE);
    }

    if (newAchievements.length > 0) {
      setAchievements(prev => [...prev, ...newAchievements]);
      newAchievements.forEach(achievement => {
        showModal(
          'Achievement Unlocked!',
          `<div class="flex items-center gap-2">
            <span class="text-2xl">${achievement.icon}</span>
            <div>
              <h4 class="font-bold">${achievement.title}</h4>
              <p class="text-sm opacity-90">${achievement.description}</p>
            </div>
          </div>`
        );
      });
    }

    // Show completion modal based on game mode
    switch (gameMode) {
      case GAME_MODES.TIME_ATTACK:
        showModal(
          'Time Attack Complete!',
          `Final Score: ${gameStats.score}<br>Time: ${formatTime(timeElapsed)}`
        );
        break;
        
      case GAME_MODES.CHALLENGE:
        const nextLevel = gameStats.challengeLevel + 1;
        showModal(
          'Challenge Complete!',
          `Level ${gameStats.challengeLevel} completed!<br>Moves used: ${gameStats.movesUsed}/${gameStats.maxMoves}`,
          [{
            text: 'Next Level',
            onClick: `this.parentElement.parentElement.parentElement.remove();
              ${setGameStats(prev => ({
                ...prev,
                challengeLevel: nextLevel,
                maxMoves: Math.max(50, 100 - (nextLevel * 10)),
                movesUsed: 0,
                rotationLocked: nextLevel > 2
              }))}
            `
          }]
        );
        break;
        
      default:
        showModal(
          'Puzzle Complete!',
          `Time: ${formatTime(timeElapsed)}`
        );
    }

    setGameStats(prev => ({
      ...prev,
      elapsedTime: timeElapsed
    }));
  }, [gameMode, gameStats]);

  // Animation loop
  const animate = useCallback(() => {
    if (!renderer || !scene || !camera) return;

    requestAnimationFrame(animate);
    
    // Update controls
    orbitControls?.update();
    
    // Update post-processing
    composerRef.current?.render();

    // Update game time and state
    if (gameStats.startTime && !gameStats.completionTime) {
      const currentTime = Math.floor((Date.now() - gameStats.startTime) / 1000);
      
      if (gameMode === GAME_MODES.TIME_ATTACK) {
        const remaining = Math.max(0, gameStats.timeLimit - currentTime);
        setGameStats(prev => ({
          ...prev,
          timeRemaining: remaining,
          elapsedTime: currentTime
        }));

        if (remaining === 0) {
          handlePuzzleComplete();
        }
      } else {
        setGameStats(prev => ({
          ...prev,
          elapsedTime: currentTime
        }));
      }
    }
  }, [renderer, scene, camera, orbitControls, gameMode, gameStats, handlePuzzleComplete]);

  // Effect hooks
  useEffect(() => {
    initScene();
    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, [initScene, handleResize]);

  useEffect(() => {
    animate();
  }, [animate]);

  // UI Components
  const GameControls = () => (
    <div className={`${panelClasses} top-4 left-4`}>
      <input
        type="file"
        accept="image/*"
        onChange={handleImageUpload}
        className="block w-full text-sm mb-2 file:mr-4 file:py-2 file:px-4 
          file:rounded file:border-0 file:bg-blue-600 file:text-white
          hover:file:bg-blue-700"
      />
      <div className="space-y-1">
        <p>Pieces: {gameStats.placedPieces}/{gameStats.totalPieces}</p>
        <p>Time: {formatTime(gameStats.elapsedTime)}</p>
        {gameMode === GAME_MODES.TIME_ATTACK && (
          <p>Time Remaining: {formatTime(gameStats.timeRemaining)}</p>
        )}
        {gameMode === GAME_MODES.CHALLENGE && (
          <>
            <p>Level: {gameStats.challengeLevel}</p>
            <p>Moves: {gameStats.movesUsed}/{gameStats.maxMoves}</p>
          </>
        )}
      </div>
    </div>
  );

  const PowerUpsPanel = () => (
    <div className={`${panelClasses} top-4 right-4`}>
      <h3 className="font-medium mb-2">Power-ups</h3>
      <div className="grid grid-cols-2 gap-2">
        {Object.entries(POWER_UPS).map(([key, value]) => (
          <button
            key={key}
            onClick={() => handlePowerUp(value)}
            className={`${buttonClasses} ${
              activePowerUp === value 
                ? 'bg-blue-600 hover:bg-blue-700' 
                : 'bg-blue-800 hover:bg-blue-900'
            }`}
            disabled={activePowerUp !== null}
          >
            {key}
          </button>
        ))}
      </div>
    </div>
  );

  const GameModes = () => (
    <div className={`${panelClasses} bottom-4 left-4 flex gap-2`}>
      {Object.entries(GAME_MODES).map(([key, mode]) => (
        <button
          key={mode}
          onClick={() => initializeGameMode(mode)}
          className={`${buttonClasses} ${
            gameMode === mode 
              ? 'bg-blue-600 hover:bg-blue-700' 
              : 'bg-blue-800 hover:bg-blue-900'
          }`}
        >
          {key}
        </button>
      ))}
    </div>
  );

  const Instructions = () => (
    <div className={`${panelClasses} bottom-4 right-4`}>
      <button 
        className="absolute top-2 right-2 text-white opacity-50 hover:opacity-100"
        onClick={() => setShowInstructions(false)}
      >
        ✕
      </button>
      <h3 className="font-medium mb-2">Instructions</h3>
      <ul className="space-y-1 text-sm">
        <li>• Drag pieces to move them</li>
        <li>• Right-click + drag to rotate view</li>
        <li>• Scroll to zoom</li>
        <li>• Use power-ups for help</li>
      </ul>
    </div>
  );

  // Main render
  return (
    <div className="relative w-full h-screen overflow-hidden bg-slate-900">
      {/* Three.js container */}
      <div 
        ref={mountRef} 
        className="absolute inset-0 z-0 touch-none"
        style={{
          isolation: 'isolate',
          touchAction: 'none',
        }}
      />

      {/* UI Overlay */}
      <div className="absolute inset-0 z-10 pointer-events-none">
        <div className="pointer-events-auto">
          <GameControls />
          <PowerUpsPanel />
          <GameModes />
          {showInstructions && <Instructions />}
        </div>
      </div>
    </div>
  );
};

export default ImagePuzzle3D;

  const showModal = (title, content, buttons = [{ text: 'Close' }]) => {
    const modal = document.createElement('div');
    modal.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50';
    modal.innerHTML = `
      <div class="bg-blue-900 p-6 rounded-lg shadow-xl">
        <h2 class="text-xl font-bold text-white mb-4">${title}</h2>
        <div class="text-white mb-4">${content}</div>
        <div class="flex gap-2 justify-end">
          ${buttons.map(btn => `
            <button class="px-4 py-2 ${btn.class || 'bg-blue-600 hover:bg-blue-700'} text-white rounded"
              onclick="${btn.onClick || 'this.parentElement.parentElement.parentElement.remove()'}"
            >
              ${btn.text}
            </button>
          `).join('')}
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    return modal;
  };