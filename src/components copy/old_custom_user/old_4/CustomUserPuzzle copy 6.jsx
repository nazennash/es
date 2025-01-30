import React, { useState, useEffect, useRef, useCallback } from 'react';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { DragControls } from 'three/examples/jsm/controls/DragControls';
import { ZoomIn, ZoomOut, RotateCw, Play, Home, Camera, Share2, Info, X } from 'lucide-react';
import * as THREE from 'three';
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
    // Add tutorial state
    const [tutorial, setTutorial] = useState({
        isActive: false,
        step: 0,
        steps: [
            {
                title: "Welcome to 3D Photo Puzzle!",
                content: "Let's learn how to play the game.",
                position: { x: 0, y: 0 }
            },
            {
                title: "Moving Pieces",
                content: "Click and drag pieces to move them around the board.",
                position: { x: 0, y: 0 }
            },
            {
                title: "Rotating Pieces",
                content: "Select a piece and click the rotate button or press 'R' to rotate it.",
                position: { x: 0, y: 0 }
            },
            {
                title: "Guide Boxes",
                content: "Match pieces to their corresponding guide boxes. They'll snap into place when correctly positioned.",
                position: { x: 0, y: 0 }
            }
        ]
    });

    // Existing state...
    const [gameState, setGameState] = useState({
        imageUrl: '',
        difficulty: DEFAULT_DIFFICULTY,
        timer: 0,
        isStarted: false,
        isCompleted: false,
        startTime: null,
        progress: 0
    });

    const [sceneState, setSceneState] = useState({
        pieces: [],
        selectedPiece: null,
        isDragging: false,
        guideBoxes: []
    });

    const [ui, setUi] = useState({
        loading: false,
        error: null,
        showControls: true,
        showSettings: false,
        showTutorial: true,
        thumbnailUrl: null
    });

    // Refs...
    const mountRef = useRef(null);
    const sceneRef = useRef(null);
    const cameraRef = useRef(null);
    const rendererRef = useRef(null);
    const orbitControlsRef = useRef(null);
    const dragControlsRef = useRef(null);
    const guideBoxesRef = useRef([]);

    // Create guide boxes
    const createGuideBoxes = useCallback((difficulty) => {
        if (!sceneRef.current) return;

        // Remove existing guide boxes
        guideBoxesRef.current.forEach(box => {
            if (box && sceneRef.current) {
                sceneRef.current.remove(box);
            }
        });
        guideBoxesRef.current = [];

        const pieceWidth = 1 / difficulty;
        const pieceHeight = 1 / difficulty;

        // Create guide boxes
        for (let i = 0; i < difficulty; i++) {
            for (let j = 0; j < difficulty; j++) {
                const geometry = new THREE.BoxGeometry(
                    pieceWidth - PIECE_GAP,
                    pieceHeight - PIECE_GAP,
                    EXTRUSION_DEPTH
                );
                
                const material = new THREE.MeshBasicMaterial({
                    color: 0x88ccff,
                    opacity: 0.3,
                    transparent: true,
                    wireframe: true
                });

                const box = new THREE.Mesh(geometry, material);
                
                // Position
                const x = (i - difficulty/2 + 0.5) * pieceWidth * 2;
                const y = (j - difficulty/2 + 0.5) * pieceHeight * 2;
                box.position.set(x, y, -EXTRUSION_DEPTH/2);

                box.userData = {
                    isGuideBox: true,
                    gridPosition: { i, j }
                };

                sceneRef.current.add(box);
                guideBoxesRef.current.push(box);
            }
        }
    }, []);

    // Modified createPuzzlePieces to match guide box sizes
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

        // Create guide boxes first
        createGuideBoxes(difficulty);

        // Create pieces
        for (let i = 0; i < difficulty; i++) {
            for (let j = 0; j < difficulty; j++) {
                const shape = new THREE.Shape();
                const w = pieceWidth - PIECE_GAP;
                const h = pieceHeight - PIECE_GAP;
                const bevel = 0.02;

                // ... (shape creation code remains the same)

                const extrudeSettings = {
                    steps: 1,
                    depth: EXTRUSION_DEPTH,
                    bevelEnabled: true,
                    bevelThickness: 0.01,
                    bevelSize: 0.01,
                    bevelSegments: 1
                };

                const geometry = new THREE.ExtrudeGeometry(shape, extrudeSettings);

                // Enhanced materials with better visibility
                const materials = [
                    new THREE.MeshPhongMaterial({ 
                        map: texture,
                        shininess: 50,
                        specular: 0x444444
                    }),
                    new THREE.MeshPhongMaterial({ 
                        color: 0x808080,
                        shininess: 50,
                        specular: 0x444444
                    })
                ];

                const piece = new THREE.Mesh(geometry, materials);

                // Position and metadata
                const correctX = (i - difficulty/2 + 0.5) * pieceWidth * 2;
                const correctY = (j - difficulty/2 + 0.5) * pieceHeight * 2;
                
                // Random initial position in a circle around the center
                const angle = Math.random() * Math.PI * 2;
                const radius = 2 + Math.random();
                piece.position.set(
                    Math.cos(angle) * radius,
                    Math.sin(angle) * radius,
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

                piece.userData = {
                    isPuzzlePiece: true,
                    isPlaced: false,
                    correctPosition: new THREE.Vector3(correctX, correctY, 0),
                    gridPosition: { i, j },
                    id: `piece-${i}-${j}`
                };

                sceneRef.current.add(piece);
                pieces.push(piece);

                // Add highlight effect when hovering over piece
                piece.userData.onHover = () => {
                    if (!piece.userData.isPlaced) {
                        gsap.to(piece.position, {
                            z: 0.1,
                            duration: 0.2
                        });
                    }
                };

                piece.userData.onHoverEnd = () => {
                    if (!piece.userData.isPlaced) {
                        gsap.to(piece.position, {
                            z: 0,
                            duration: 0.2
                        });
                    }
                };
            }
        }

        // Setup enhanced drag controls
        if (dragControlsRef.current) {
            dragControlsRef.current.dispose();
        }

        const dragControls = new DragControls(pieces, cameraRef.current, rendererRef.current.domElement);
        
        dragControls.addEventListener('dragstart', (event) => {
            orbitControlsRef.current.enabled = false;
            const piece = event.object;
            
            if (!piece.userData.isPlaced) {
                gsap.to(piece.position, {
                    z: 0.2,
                    duration: 0.2
                });
            }

            setSceneState(prev => ({
                ...prev,
                selectedPiece: piece,
                isDragging: true
            }));
        });

        dragControls.addEventListener('drag', (event) => {
            const piece = event.object;
            piece.position.z = 0.2;

            // Highlight nearest guide box
            const nearestBox = findNearestGuideBox(piece);
            if (nearestBox) {
                highlightGuideBox(nearestBox);
            }
        });

        dragControls.addEventListener('dragend', (event) => {
            orbitControlsRef.current.enabled = true;
            const piece = event.object;
            
            if (!piece.userData.isPlaced) {
                checkPiecePlacement(piece);
            }

            // Reset guide box highlights
            resetGuideBoxHighlights();

            setSceneState(prev => ({
                ...prev,
                isDragging: false
            }));
        });

        dragControlsRef.current = dragControls;
        setSceneState(prev => ({ ...prev, pieces }));

    }, [gameState.difficulty, createGuideBoxes]);

    // Helper functions for guide boxes
    const findNearestGuideBox = (piece) => {
        let nearest = null;
        let minDistance = Infinity;

        guideBoxesRef.current.forEach(box => {
            const distance = piece.position.distanceTo(box.position);
            if (distance < minDistance) {
                minDistance = distance;
                nearest = box;
            }
        });

        return nearest;
    };

    const highlightGuideBox = (box) => {
        guideBoxesRef.current.forEach(b => {
            if (b === box) {
                b.material.opacity = 0.5;
                b.material.color.setHex(0x00ff00);
            } else {
                b.material.opacity = 0.3;
                b.material.color.setHex(0x88ccff);
            }
        });
    };

    const resetGuideBoxHighlights = () => {
        guideBoxesRef.current.forEach(box => {
            box.material.opacity = 0.3;
            box.material.color.setHex(0x88ccff);
        });
    };

    // Enhanced piece placement check with visual feedback
    const checkPiecePlacement = useCallback((piece) => {
        if (!piece.userData?.correctPosition || piece.userData.isPlaced) return false;

        const positionCorrect = piece.position.distanceTo(piece.userData.correctPosition) < POSITION_TOLERANCE;
        const rotationCorrect = 
            Math.abs(piece.rotation.x % (Math.PI * 2)) < ROTATION_TOLERANCE &&
            Math.abs(piece.rotation.y % (Math.PI * 2)) < ROTATION_TOLERANCE &&
            Math.abs(piece.rotation.z % (Math.PI * 2)) < ROTATION_TOLERANCE;

        if (positionCorrect && rotationCorrect) {
            // Enhanced snap animation
            gsap.to(piece.position, {
                x: piece.userData.correctPosition.x,
                y: piece.userData.correctPosition.y,
                z: 0,
                duration: 0.4,
                ease: "elastic.out(1, 0.5)"
            });

            gsap.to(piece.rotation, {
                x: 0,
                y: 0,
                z: 0,
                duration: 0.4,
                ease: "elastic.out(1, 0.5)"
            });

            // Success effects
            const glowMaterial = piece.material[0].clone();
            glowMaterial.emissive.setHex(0x00ff00);
            glowMaterial.emissiveIntensity = 0.5;
            
            gsap.to(glowMaterial, {
                emissiveIntensity: 0,
                duration: 1.5,
                ease: "power2.out"
            });

            piece.material[0] = glowMaterial;
            piece.userData.isPlaced = true;

            // Hide corresponding guide box
            const guideBox = guideBoxesRef.current.find(box => 
                box.userData.gridPosition.i === piece.userData.gridPosition.i &&
                box.userData.gridPosition.j === piece.userData.gridPosition.j
            );
            
            if (guideBox) {
                gsap.to(guideBox.material, {
                    opacity: 0,
                    duration: 0.5
                });
            }

            // Update progress with animation
            const progress = (sceneState.pieces.filter(p => p.userData.isPlaced).length / sceneState.pieces.length) * 100;
            setGameState(prev => ({ ...prev, progress }));

            // Play success sound if available
            // const successSound = new Audio('/success.mp3');
            // successSound.play();

            if (progress === 100) {
                handlePuzzleComplete();
            }

            return true;
        }

        return false;
    }, [sceneState.pieces]);

    // Tutorial component
    const TutorialOverlay = () => {
        if (!tutorial.isActive) return null;

        const currentStep = tutorial.steps[tutorial.step];

        return (
            <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center">
                <div className="bg-white p-6 rounded-xl max-w-md">
                    <div className="flex justify-between">
                        <button
                            onClick={() => setTutorial(prev => ({
                                ...prev,
                                step: Math.max(0, prev.step - 1)
                            }))}
                            disabled={tutorial.step === 0}
                            className="px-4 py-2 bg-gray-100 hover:bg-gray-200 disabled:opacity-50 rounded-lg"
                        >
                            Previous
                        </button>
                        <button
                            onClick={() => {
                                if (tutorial.step === tutorial.steps.length - 1) {
                                    setTutorial(prev => ({ ...prev, isActive: false }));
                                } else {
                                    setTutorial(prev => ({
                                        ...prev,
                                        step: prev.step + 1
                                    }));
                                }
                            }}
                            className="px-4 py-2 bg-blue-500 text-white hover:bg-blue-600 rounded-lg"
                        >
                            {tutorial.step === tutorial.steps.length - 1 ? 'Got it!' : 'Next'}
                        </button>
                    </div>
                </div>
            </div>
        );
    };

    // Initialize scene with enhanced lighting
    const initScene = useCallback(() => {
        if (!mountRef.current) return;

        const scene = new THREE.Scene();
        scene.background = new THREE.Color(0xf0f0f0);
        sceneRef.current = scene;

        // Enhanced camera setup
        const camera = new THREE.PerspectiveCamera(
            75,
            mountRef.current.clientWidth / mountRef.current.clientHeight,
            0.1,
            1000
        );
        camera.position.set(0, 0, 5);
        cameraRef.current = camera;

        // Enhanced renderer with better shadows
        const renderer = new THREE.WebGLRenderer({ 
            antialias: true,
            alpha: true,
            shadowMap: {
                enabled: true,
                type: THREE.PCFSoftShadowMap
            }
        });
        renderer.setSize(mountRef.current.clientWidth, mountRef.current.clientHeight);
        renderer.shadowMap.enabled = true;
        mountRef.current.appendChild(renderer.domElement);
        rendererRef.current = renderer;

        // Enhanced lighting setup
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
        scene.add(ambientLight);

        const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
        directionalLight.position.set(5, 5, 5);
        directionalLight.castShadow = true;
        directionalLight.shadow.mapSize.width = 1024;
        directionalLight.shadow.mapSize.height = 1024;
        scene.add(directionalLight);

        const backLight = new THREE.DirectionalLight(0xffffff, 0.3);
        backLight.position.set(-5, -5, -5);
        scene.add(backLight);

        // Grid helper with better visibility
        const grid = new THREE.GridHelper(10, 20, 0x888888, 0x444444);
        grid.position.z = -0.5;
        scene.add(grid);

        // Enhanced controls
        const orbitControls = new OrbitControls(camera, renderer.domElement);
        orbitControls.enableDamping = true;
        orbitControls.dampingFactor = 0.05;
        orbitControls.screenSpacePanning = true;
        orbitControls.minDistance = 2;
        orbitControls.maxDistance = 10;
        orbitControlsRef.current = orbitControls;

        // Animation loop with smooth controls
        const animate = () => {
            animationFrameRef.current = requestAnimationFrame(animate);
            orbitControls.update();
            renderer.render(scene, camera);
            updateHighlights();
        };

        animate();

        // Responsive handling
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

    // Update highlights for hover effects
    const updateHighlights = useCallback(() => {
        if (!sceneState.pieces.length || !cameraRef.current || !rendererRef.current) return;

        const raycaster = new THREE.Raycaster();
        const mouse = new THREE.Vector2();

        const rect = rendererRef.current.domElement.getBoundingClientRect();
        mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

        raycaster.setFromCamera(mouse, cameraRef.current);

        const intersects = raycaster.intersectObjects(sceneState.pieces);
        
        sceneState.pieces.forEach(piece => {
            if (intersects[0]?.object === piece) {
                piece.userData.onHover?.();
            } else {
                piece.userData.onHoverEnd?.();
            }
        });
    }, [sceneState.pieces]);

    // Main render
    return (
        <div className="flex flex-col h-screen bg-gray-100">
            {/* Header with enhanced styling */}
            <div className="flex justify-between items-center px-6 py-4 bg-white shadow-md">
                <h1 className="text-2xl font-bold text-gray-800">3D Photo Puzzle</h1>
                <div className="flex items-center gap-4">
                    <div className="text-lg font-semibold">
                        Time: {Math.floor(gameState.timer / 60)}:
                        {String(gameState.timer % 60).padStart(2, '0')}
                    </div>
                    <button
                        onClick={() => setTutorial(prev => ({ ...prev, isActive: true, step: 0 }))}
                        className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
                        title="Show Tutorial"
                    >
                        <Info className="h-5 w-5" />
                    </button>
                    <button
                        onClick={resetCamera}
                        className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
                        title="Reset Camera"
                    >
                        <Home className="h-5 w-5" />
                    </button>
                </div>
            </div>

            {/* Main content area */}
            <div className="flex flex-1 overflow-hidden">
                {/* Side panel with enhanced UI */}
                {/* ... Rest of the component remains the same ... */}
            </div>

            {/* Tutorial overlay */}
            <TutorialOverlay />

            {/* Completion modal with enhanced effects */}
            {gameState.isCompleted && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                    <div className="bg-white p-8 rounded-xl shadow-2xl max-w-md w-full">
                        <div className="text-center">
                            <h2 className="text-3xl font-bold text-gray-800 mb-2">
                                Puzzle Completed! 🎉
                            </h2>
                            <div className="text-5xl font-bold text-blue-500 my-4">
                                {Math.floor(gameState.timer / 60)}:
                                {String(gameState.timer % 60).padStart(2, '0')}
                            </div>
                            <p className="text-gray-600 mb-6">
                                Congratulations! You've completed the puzzle in{' '}
                                {gameState.difficulty}x{gameState.difficulty} mode.
                            </p>
                        </div>
                        <div className="space-y-3">
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
// items-center mb-4">
//                         <h3 className="text-xl font-bold">{currentStep.title}</h3>
//                         <button 
//                             onClick={() => setTutorial(prev => ({ ...prev, isActive: false }))}
//                             className="p-1 hover:bg-gray-100 rounded-full"
//                         >
//                             <X className="h-5 w-5" />
//                         </button>
//                     </div>
//                     <p className="text-gray-600 mb-4">{currentStep.content}</p>
//                     <div className="flex justify-between