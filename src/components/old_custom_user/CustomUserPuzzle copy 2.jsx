import React, { useState, useEffect, useRef, useCallback } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { DragControls } from 'three/examples/jsm/controls/DragControls';
import { ZoomIn, ZoomOut, RotateCw, Play, Home, Camera, Share2, Info } from 'lucide-react';
import gsap from 'gsap';

// Constants
const EXTRUSION_DEPTH = 0.1;
const PIECE_GAP = 0.05;
const POSITION_TOLERANCE = 0.1;
const ROTATION_TOLERANCE = 0.1;
const DEFAULT_DIFFICULTY = 3;
const MIN_DIFFICULTY = 2;
const MAX_DIFFICULTY = 6;
const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5MB

const PhotoPuzzle3D = () => {
    // Game state
    const [gameState, setGameState] = useState({
        imageUrl: '',
        difficulty: DEFAULT_DIFFICULTY,
        timer: 0,
        isStarted: false,
        isCompleted: false,
        startTime: null,
        progress: 0
    });

    // Scene state
    const [sceneState, setSceneState] = useState({
        pieces: [],
        selectedPiece: null,
        isDragging: false
    });

    // UI state
    const [ui, setUi] = useState({
        loading: false,
        error: null,
        showControls: true,
        showSettings: false,
        showTutorial: false,
        thumbnailUrl: null
    });

    // Refs
    const mountRef = useRef(null);
    const sceneRef = useRef(null);
    const cameraRef = useRef(null);
    const rendererRef = useRef(null);
    const orbitControlsRef = useRef(null);
    const dragControlsRef = useRef(null);
    const raycasterRef = useRef(new THREE.Raycaster());
    const mouseRef = useRef(new THREE.Vector2());
    const gridRef = useRef(null);
    const timerRef = useRef(null);
    const animationFrameRef = useRef(null);
    const progressBarRef = useRef(null);

    // Initialize scene
    const initScene = useCallback(() => {
        if (!mountRef.current) return;

        // Scene
        const scene = new THREE.Scene();
        scene.background = new THREE.Color(0xf0f0f0);
        sceneRef.current = scene;

        // Camera
        const camera = new THREE.PerspectiveCamera(
            75,
            mountRef.current.clientWidth / mountRef.current.clientHeight,
            0.1,
            1000
        );
        camera.position.set(0, 0, 5);
        cameraRef.current = camera;

        // Renderer
        const renderer = new THREE.WebGLRenderer({ 
            antialias: true,
            alpha: true
        });
        renderer.setSize(mountRef.current.clientWidth, mountRef.current.clientHeight);
        renderer.shadowMap.enabled = true;
        mountRef.current.appendChild(renderer.domElement);
        rendererRef.current = renderer;

        // Lighting
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
        scene.add(ambientLight);

        const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
        directionalLight.position.set(10, 10, 10);
        directionalLight.castShadow = true;
        scene.add(directionalLight);

        // Grid helper
        const grid = new THREE.GridHelper(10, 10, 0x888888, 0x888888);
        grid.position.z = -0.5;
        scene.add(grid);
        gridRef.current = grid;

        // Controls
        const orbitControls = new OrbitControls(camera, renderer.domElement);
        orbitControls.enableDamping = true;
        orbitControls.dampingFactor = 0.05;
        orbitControls.screenSpacePanning = true;
        orbitControlsRef.current = orbitControls;

        // Animation loop
        const animate = () => {
            animationFrameRef.current = requestAnimationFrame(animate);
            orbitControls.update();
            renderer.render(scene, camera);
            gsap.ticker.tick();
        };
        animate();

        // Window resize handler
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

    // Create puzzle pieces
    const createPuzzlePieces = useCallback((texture) => {
        if (!sceneRef.current) return;

        // Clear existing pieces
        sceneRef.current.children
            .filter(child => child.userData?.isPuzzlePiece)
            .forEach(piece => sceneRef.current.remove(piece));

        const pieces = [];
        const { difficulty } = gameState;
        const pieceWidth = 1 / difficulty;
        const pieceHeight = 1 / difficulty;
        const textureAspect = texture.image.width / texture.image.height;

        // Create pieces
        for (let i = 0; i < difficulty; i++) {
            for (let j = 0; j < difficulty; j++) {
                // Geometry with beveled edges
                const shape = new THREE.Shape();
                const w = pieceWidth - PIECE_GAP;
                const h = pieceHeight - PIECE_GAP;
                const bevel = 0.02;

                shape.moveTo(0, bevel);
                shape.lineTo(0, h - bevel);
                shape.quadraticCurveTo(0, h, bevel, h);
                shape.lineTo(w - bevel, h);
                shape.quadraticCurveTo(w, h, w, h - bevel);
                shape.lineTo(w, bevel);
                shape.quadraticCurveTo(w, 0, w - bevel, 0);
                shape.lineTo(bevel, 0);
                shape.quadraticCurveTo(0, 0, 0, bevel);

                const extrudeSettings = {
                    steps: 1,
                    depth: EXTRUSION_DEPTH,
                    bevelEnabled: true,
                    bevelThickness: 0.01,
                    bevelSize: 0.01,
                    bevelSegments: 1
                };

                const geometry = new THREE.ExtrudeGeometry(shape, extrudeSettings);

                // Materials
                const materials = [
                    new THREE.MeshPhongMaterial({ 
                        map: texture,
                        shininess: 50
                    }),
                    new THREE.MeshPhongMaterial({ 
                        color: 0x808080,
                        shininess: 50
                    })
                ];

                // Create mesh
                const piece = new THREE.Mesh(geometry, materials);

                // Set correct position
                const correctX = (i - difficulty/2 + 0.5) * pieceWidth * 2;
                const correctY = (j - difficulty/2 + 0.5) * pieceHeight * 2;

                // Random initial position
                piece.position.set(
                    (Math.random() - 0.5) * 4,
                    (Math.random() - 0.5) * 4,
                    0
                );

                // UV mapping
                const uvAttribute = piece.geometry.attributes.uv;
                for (let k = 0; k < uvAttribute.count; k++) {
                    uvAttribute.setXY(
                        k,
                        (i + uvAttribute.getX(k)) / difficulty,
                        1 - ((j + uvAttribute.getY(k)) / difficulty)
                    );
                }

                // Metadata
                piece.userData = {
                    isPuzzlePiece: true,
                    isPlaced: false,
                    correctPosition: new THREE.Vector3(correctX, correctY, 0),
                    initialRotation: piece.rotation.clone(),
                    id: `piece-${i}-${j}`
                };

                // Add to scene
                sceneRef.current.add(piece);
                pieces.push(piece);
            }
        }

        // Setup drag controls
        if (dragControlsRef.current) {
            dragControlsRef.current.dispose();
        }
        const dragControls = new DragControls(pieces, cameraRef.current, rendererRef.current.domElement);
        
        dragControls.addEventListener('dragstart', (event) => {
            orbitControlsRef.current.enabled = false;
            setSceneState(prev => ({
                ...prev,
                selectedPiece: event.object,
                isDragging: true
            }));
        });

        dragControls.addEventListener('drag', (event) => {
            event.object.position.z = 0;
        });

        dragControls.addEventListener('dragend', (event) => {
            orbitControlsRef.current.enabled = true;
            checkPiecePlacement(event.object);
            setSceneState(prev => ({
                ...prev,
                isDragging: false
            }));
        });

        dragControlsRef.current = dragControls;
        setSceneState(prev => ({ ...prev, pieces }));

        // Create and set thumbnail
        const thumbnailCanvas = document.createElement('canvas');
        thumbnailCanvas.width = 150;
        thumbnailCanvas.height = 150 / textureAspect;
        const ctx = thumbnailCanvas.getContext('2d');
        ctx.drawImage(texture.image, 0, 0, thumbnailCanvas.width, thumbnailCanvas.height);
        setUi(prev => ({ ...prev, thumbnailUrl: thumbnailCanvas.toDataURL() }));

    }, [gameState.difficulty]);

    // Check piece placement
    const checkPiecePlacement = useCallback((piece) => {
        if (!piece.userData?.correctPosition || piece.userData.isPlaced) return false;

        const positionCorrect = piece.position.distanceTo(piece.userData.correctPosition) < POSITION_TOLERANCE;
        const rotationCorrect = 
            Math.abs(piece.rotation.x % (Math.PI * 2)) < ROTATION_TOLERANCE &&
            Math.abs(piece.rotation.y % (Math.PI * 2)) < ROTATION_TOLERANCE &&
            Math.abs(piece.rotation.z % (Math.PI * 2)) < ROTATION_TOLERANCE;

        if (positionCorrect && rotationCorrect) {
            // Snap animation
            gsap.to(piece.position, {
                x: piece.userData.correctPosition.x,
                y: piece.userData.correctPosition.y,
                z: piece.userData.correctPosition.z,
                duration: 0.3,
                ease: "back.out(2)"
            });

            gsap.to(piece.rotation, {
                x: 0,
                y: 0,
                z: 0,
                duration: 0.3,
                ease: "back.out(2)"
            });

            // Success effect
            const glowMaterial = piece.material[0].clone();
            glowMaterial.emissive.setHex(0x00ff00);
            glowMaterial.emissiveIntensity = 0.5;
            
            gsap.to(glowMaterial, {
                emissiveIntensity: 0,
                duration: 1,
                ease: "power2.out"
            });

            piece.material[0] = glowMaterial;
            piece.userData.isPlaced = true;

            // Update progress
            const progress = (sceneState.pieces.filter(p => p.userData.isPlaced).length / sceneState.pieces.length) * 100;
            setGameState(prev => ({ ...prev, progress }));

            // Check completion
            if (progress === 100) {
                handlePuzzleComplete();
            }

            return true;
        }

        return false;
    }, [sceneState.pieces]);

    // Handle puzzle completion
    const handlePuzzleComplete = useCallback(() => {
        const finalTime = Math.floor((Date.now() - gameState.startTime) / 1000);
        setGameState(prev => ({
            ...prev,
            isCompleted: true,
            timer: finalTime
        }));

        // Celebration animation
        sceneState.pieces.forEach((piece, index) => {
            gsap.to(piece.position, {
                z: 0.5,
                duration: 0.5,
                delay: index * 0.05,
                yoyo: true,
                repeat: 1,
                ease: "power2.inOut"
            });

            gsap.to(piece.rotation, {
                z: Math.PI * 2,
                duration: 1,
                delay: index * 0.05,
                ease: "power2.inOut"
            });
        });
    }, [gameState.startTime, sceneState.pieces]);

    // Initialize game
    const startGame = useCallback(() => {
        if (!gameState.imageUrl) return;

        setGameState(prev => ({
            ...prev,
            isStarted: true,
            startTime: Date.now(),
            timer: 0,
            isCompleted: false,
            progress: 0
        }));

        // Start timer
        if (timerRef.current) {
            clearInterval(timerRef.current);
        }

        timerRef.current = setInterval(() => {
            setGameState(prev => ({
                ...prev,
                timer: Math.floor((Date.now() - prev.startTime) / 1000)
            }));
        }, 1000);
    }, [gameState.imageUrl]);

    // Handle image upload
    const handleImageUpload = async (event) => {
        const file = event.target.files?.[0];
        if (!file) return;

        try {
            setUi(prev => ({ ...prev, loading: true, error: null }));

            if (file.size > MAX_IMAGE_SIZE) {
                throw new Error('Image must be smaller than 5MB');
            }

            if (!file.type.startsWith('image/')) {
                throw new Error('File must be an image');
            }

            const imageUrl = URL.createObjectURL(file);
            const textureLoader = new THREE.TextureLoader();
            
            const texture = await new Promise((resolve, reject) => {
                textureLoader.load(
                    imageUrl,
                    resolve,
                    undefined,
                    reject
                );
            });

            setGameState(prev => ({ ...prev, imageUrl }));
            createPuzzlePieces(texture);

        } catch (err) {
            console.error('Image upload error:', err);
            setUi(prev => ({
                ...prev,
                error: err.message || 'Failed to upload image'
            }));
        } finally {
            setUi(prev => ({ ...prev, loading: false }));
        }
    };

    // Effect hooks
    useEffect(() => {
        const cleanup = initScene();
        return () => {
            if (cleanup) cleanup();
            if (timerRef.current) clearInterval(timerRef.current);
        };
    }, [initScene]);

    // Rotation handler
    const handleRotate = useCallback(() => {
        if (!sceneState.selectedPiece) return;
        
        gsap.to(sceneState.selectedPiece.rotation, {
            z: sceneState.selectedPiece.rotation.z + Math.PI/2,
            duration: 0.3,
            ease: "power2.out",
            onComplete: () => checkPiecePlacement(sceneState.selectedPiece)
        });
    }, [sceneState.selectedPiece, checkPiecePlacement]);

    // Reset camera
    const resetCamera = useCallback(() => {
        if (!cameraRef.current || !orbitControlsRef.current) return;

        gsap.to(cameraRef.current.position, {
            x: 0,
            y: 0,
            z: 5,
            duration: 1,
            ease: "power2.inOut"
        });

        gsap.to(orbitControlsRef.current.target, {
            x: 0,
            y: 0,
            z: 0,
            duration: 1,
            ease: "power2.inOut"
        });
    }, []);

    return (
        <div className="flex flex-col h-screen bg-gray-100">
            {/* Header */}
            <div className="flex justify-between items-center px-6 py-4 bg-white shadow-md">
                <h1 className="text-2xl font-bold text-gray-800">3D Photo Puzzle</h1>
                <div className="flex items-center gap-4">
                    <div className="text-lg font-semibold">
                        Time: {Math.floor(gameState.timer / 60)}:
                        {String(gameState.timer % 60).padStart(2, '0')}
                    </div>
                    <button
                        onClick={resetCamera}
                        className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
                        title="Reset Camera"
                    >
                        <Home className="h-5 w-5" />
                    </button>
                </div>
            </div>

            {/* Main content */}
            <div className="flex flex-1 overflow-hidden">
                {/* Side panel */}
                <div className="w-72 bg-white shadow-lg p-6 space-y-6 flex flex-col">
                    {/* Thumbnail */}
                    {ui.thumbnailUrl && (
                        <div className="space-y-2">
                            <h3 className="font-semibold text-gray-700">Reference Image</h3>
                            <div className="relative rounded-lg overflow-hidden shadow-md">
                                <img
                                    src={ui.thumbnailUrl}
                                    alt="Puzzle reference"
                                    className="w-full object-cover"
                                />
                            </div>
                        </div>
                    )}

                    {/* Progress */}
                    <div className="space-y-2">
                        <h3 className="font-semibold text-gray-700">Progress</h3>
                        <div className="h-4 bg-gray-200 rounded-full overflow-hidden">
                            <div
                                className="h-full bg-green-500 transition-all duration-300 ease-out"
                                style={{ width: `${gameState.progress}%` }}
                            />
                        </div>
                        <div className="text-sm text-gray-600 text-center">
                            {Math.round(gameState.progress)}% Complete
                        </div>
                    </div>

                    {/* Controls */}
                    {!gameState.imageUrl ? (
                        <div className="flex-1 flex flex-col justify-center">
                            <label className="flex flex-col items-center gap-4 p-8 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:border-gray-400 transition-colors">
                                <Camera className="h-12 w-12 text-gray-400" />
                                <span className="text-sm text-gray-600">Upload an image to start</span>
                                <input
                                    type="file"
                                    accept="image/*"
                                    onChange={handleImageUpload}
                                    className="hidden"
                                />
                            </label>
                        </div>
                    ) : !gameState.isStarted ? (
                        <div className="space-y-4">
                            <div className="space-y-2">
                                <label className="text-sm font-medium text-gray-700">
                                    Difficulty
                                </label>
                                <select
                                    value={gameState.difficulty}
                                    onChange={(e) => setGameState(prev => ({
                                        ...prev,
                                        difficulty: parseInt(e.target.value)
                                    }))}
                                    className="w-full px-3 py-2 border rounded-lg"
                                >
                                    {Array.from(
                                        { length: MAX_DIFFICULTY - MIN_DIFFICULTY + 1 },
                                        (_, i) => MIN_DIFFICULTY + i
                                    ).map(level => (
                                        <option key={level} value={level}>
                                            {level}x{level} ({level * level} pieces)
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <button
                                onClick={startGame}
                                className="w-full bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-lg transition-colors"
                            >
                                <Play className="h-4 w-4 inline mr-2" />
                                Start Game
                            </button>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            <div className="space-y-2">
                                <h3 className="font-semibold text-gray-700">Controls</h3>
                                <ul className="text-sm text-gray-600 space-y-1">
                                    <li>• Drag pieces to move</li>
                                    <li>• Click to select</li>
                                    <li>• R to rotate selected</li>
                                    <li>• Mouse wheel to zoom</li>
                                    <li>• Right click to orbit</li>
                                </ul>
                            </div>
                            <div className="flex gap-2">
                                <button
                                    onClick={handleRotate}
                                    disabled={!sceneState.selectedPiece}
                                    className="flex-1 px-4 py-2 bg-gray-100 hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors"
                                >
                                    <RotateCw className="h-4 w-4 inline mr-2" />
                                    Rotate
                                </button>
                                <button
                                    onClick={resetCamera}
                                    className="flex-1 px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                                >
                                    <Home className="h-4 w-4 inline mr-2" />
                                    Reset View
                                </button>
                            </div>
                        </div>
                    )}
                </div>

                {/* 3D View */}
                <div className="flex-1 relative">
                    <div
                        ref={mountRef}
                        className="w-full h-full bg-gradient-to-b from-gray-100 to-gray-200"
                    />

                    {/* Loading overlay */}
                    {ui.loading && (
                        <div className="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center">
                            <div className="animate-spin rounded-full h-16 w-16 border-t-2 border-b-2 border-white"></div>
                        </div>
                    )}

                    {/* Error message */}
                    {ui.error && (
                        <div className="absolute top-4 right-4 bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded-lg">
                            {ui.error}
                        </div>
                    )}
                </div>
            </div>

            {/* Completion modal */}
            {gameState.isCompleted && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                    <div className="bg-white p-8 rounded-xl shadow-2xl max-w-md w-full">
                        <h2 className="text-2xl font-bold text-gray-800 mb-4">
                            Puzzle Completed! 🎉
                        </h2>
                        <p className="text-gray-600 mb-6">
                            Time: {Math.floor(gameState.timer / 60)}:
                            {String(gameState.timer % 60).padStart(2, '0')}
                        </p>
                        <div className="space-y-2">
                            <button
                                onClick={() => setUi(prev => ({ ...prev, showShareModal: true }))}
                                className="w-full bg-blue-500 hover:bg-blue-600 text-white px-6 py-3 rounded-lg transition-colors"
                            >
                                <Share2 className="h-4 w-4 inline mr-2" />
                                Share Result
                            </button>
                            <button
                                onClick={() => window.location.reload()}
                                className="w-full border border-gray-300 hover:bg-gray-50 px-6 py-3 rounded-lg transition-colors"
                            >
                                Start New Puzzle
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default PhotoPuzzle3D;