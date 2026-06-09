import * as THREE from 'three';
import { PointerLockControls } from 'three/examples/jsm/controls/PointerLockControls.js';
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js';

let scene, camera, renderer, controls;
export let playerPosition = { x: 0, y: 1, z: 0 };
let currentRole = "None";
let serverState = { sounds: [], players: {} };
let localPlayerId = null;

// Inputs
const keys = { w: false, a: false, s: false, d: false, shift: false };
const velocity = new THREE.Vector3();
const direction = new THREE.Vector3();

// Stamina System
const maxStamina = 100.0;
let currentStamina = 100.0;
const staminaRegenRate = 15.0; // Per second
const staminaDrainRate = 35.0; // Per second
export let isExhausted = false; // Prevents running if completely drained

export function getCameraRotation() {
    return camera ? camera.rotation.y : 0;
}

// Lighting
let survivorLight, ambientLight;

// Echolocation Shaders
const maxSounds = 10;
const sharedUniforms = {
    uTime: { value: 0.0 },
    uSoundPositions: { value: new Array(maxSounds).fill(new THREE.Vector3()) },
    uSoundStartTimes: { value: new Array(maxSounds).fill(0.0) },
    uSoundIntensities: { value: new Array(maxSounds).fill(0.0) },
    uSoundCount: { value: 0 }
};

const uniformsSurv = {
    ...sharedUniforms,
    uBaseColor: { value: new THREE.Vector3(0.0, 0.0, 0.0) }
};

const fragShader = `
    uniform float uTime;
    uniform vec3 uSoundPositions[10];
    uniform float uSoundStartTimes[10];
    uniform float uSoundIntensities[10];
    uniform int uSoundCount;
    uniform vec3 uBaseColor;
    
    varying vec3 vWorldPosition;
    
    void main() {
        vec3 finalColor = uBaseColor;
        
        float maxLifetime = 5.0; // 5 seconds
        float soundSpeed = 10.0;
        
        for(int i = 0; i < 10; i++) {
            if (i >= uSoundCount) break;
            
            float timeAlive = uTime - uSoundStartTimes[i];
            if (timeAlive > 0.0 && timeAlive < maxLifetime) {
                float dist = distance(vWorldPosition, uSoundPositions[i]);
                float currentRadius = timeAlive * soundSpeed;
                
                float waveThickness = 1.0;
                float wave = smoothstep(currentRadius - waveThickness, currentRadius, dist) 
                           - smoothstep(currentRadius, currentRadius + waveThickness, dist);
                           
                float attenuation = 1.0 / (1.0 + dist * 0.1) * (1.0 - (timeAlive / maxLifetime));
                
                // Bright Red Wave
                finalColor += vec3(1.0, 0.1, 0.0) * wave * uSoundIntensities[i] * attenuation; 
            }
        }
        
        gl_FragColor = vec4(finalColor, 1.0);
    }
`;

// Line Material for Walls (Red Edges)
const echolocationLineMaterial = new THREE.ShaderMaterial({
    uniforms: {
        ...sharedUniforms,
        uBaseColor: { value: new THREE.Vector3(0.5, 0.0, 0.0) } // Dark Red Edges
    },
    vertexShader: `
        varying vec3 vWorldPosition;
        void main() {
            vec4 worldPosition = modelMatrix * vec4(position, 1.0);
            vWorldPosition = worldPosition.xyz;
            gl_Position = projectionMatrix * viewMatrix * worldPosition;
        }
    `,
    fragmentShader: fragShader
});

// Survivor Material (Solid, Invisible until hit by wave)
const survivorEchoMaterial = new THREE.ShaderMaterial({
    uniforms: uniformsSurv,
    vertexShader: `
        varying vec3 vWorldPosition;
        void main() {
            vec4 worldPosition = modelMatrix * vec4(position, 1.0);
            vWorldPosition = worldPosition.xyz;
            gl_Position = projectionMatrix * viewMatrix * worldPosition;
        }
    `,
    fragmentShader: fragShader
});

// Generators & Raycasting
export let targetedGeneratorId = null;
const raycaster = new THREE.Raycaster();
const centerVector = new THREE.Vector2(0, 0); // Center of screen
let generatorMeshes = [];

// Load Textures
const textureLoader = new THREE.TextureLoader();

const wallTex = textureLoader.load('/textures/wall.png');
wallTex.wrapS = THREE.RepeatWrapping;
wallTex.wrapT = THREE.RepeatWrapping;
wallTex.repeat.set(1, 1); // 1 repetition per cell wall
wallTex.minFilter = THREE.NearestFilter;
wallTex.magFilter = THREE.NearestFilter;
wallTex.generateMipmaps = false;

const floorTex = textureLoader.load('/textures/floor.png');
floorTex.wrapS = THREE.RepeatWrapping;
floorTex.wrapT = THREE.RepeatWrapping;
floorTex.repeat.set(125, 125); // 500 units plane / 4 units per tile
floorTex.minFilter = THREE.NearestFilter;
floorTex.magFilter = THREE.NearestFilter;
floorTex.generateMipmaps = false;

const ceilingTex = textureLoader.load('/textures/ceiling.png');
ceilingTex.wrapS = THREE.RepeatWrapping;
ceilingTex.wrapT = THREE.RepeatWrapping;
ceilingTex.repeat.set(125, 125);
ceilingTex.minFilter = THREE.NearestFilter;
ceilingTex.magFilter = THREE.NearestFilter;
ceilingTex.generateMipmaps = false;

// Materials for Survivors - Changed to Phong for massive performance boost over Standard PBR
const wallMaterial = new THREE.MeshPhongMaterial({ map: wallTex, color: 0x888888, shininess: 0 });
const floorMaterial = new THREE.MeshPhongMaterial({ map: floorTex, color: 0x666666, shininess: 0 });
const ceilingMaterial = new THREE.MeshPhongMaterial({ map: ceilingTex, color: 0x666666, shininess: 0 });

let mazeInstancedMesh = null;
let mazeEdgesMesh = null;
let floorMesh = null;
let ceilingMesh = null;
let remotePlayerMeshes = {};

const blackSolidMaterial = new THREE.MeshBasicMaterial({ 
    color: 0x000000, 
    polygonOffset: true,
    polygonOffsetFactor: 1,
    polygonOffsetUnits: 1 
});

// Collision Data
let currentGrid = null;
let gridWidth = 0;
let gridHeight = 0;
let gridCellSize = 4;

let mapGrid = [];
let mapWidth = 0;
let mapHeight = 0;
let mapCellSize = 0;

// Generator State Variables
let particles = [];
let cameraShake = 0;

export function triggerGeneratorFail(id) {
    const mesh = generatorMeshes.find(m => m.userData.id === id);
    if (mesh) {
        cameraShake = 1.0;
        
        // Spawn 30 particles
        for (let i = 0; i < 30; i++) {
            const pGeo = new THREE.BoxGeometry(0.05, 0.05, 0.05);
            const pMat = new THREE.MeshBasicMaterial({ color: 0xffaa00 });
            const p = new THREE.Mesh(pGeo, pMat);
            p.position.copy(mesh.position);
            p.position.y += 0.6; // Top of the generator
            
            p.userData = {
                velocity: new THREE.Vector3((Math.random() - 0.5) * 8, Math.random() * 8 + 4, (Math.random() - 0.5) * 8),
                life: 1.0
            };
            scene.add(p);
            particles.push(p);
        }
    }
}

export function setGeneratorInteracting(id, isInteracting) {
    const mesh = generatorMeshes.find(m => m.userData.id === id);
    if (mesh) {
        mesh.userData.isInteracting = isInteracting;
    }
}

function createSurvivorModel() {
    const group = new THREE.Group();
    
    // Materials
    const suitMat = new THREE.MeshPhongMaterial({ color: 0x113355, flatShading: true });
    const gearMat = new THREE.MeshPhongMaterial({ color: 0xcc5500, flatShading: true }); // Orange hi-vis
    const metalMat = new THREE.MeshPhongMaterial({ color: 0x888888, flatShading: true });
    
    // Body Parts
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.0, 0.5), suitMat);
    torso.position.y = 1.2;
    torso.userData.originalMaterial = suitMat;
    group.add(torso);
    
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), gearMat);
    head.position.y = 1.95;
    head.userData.originalMaterial = gearMat;
    group.add(head);
    
    const backpack = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.8, 0.3), metalMat);
    backpack.position.set(0, 1.2, 0.4);
    backpack.userData.originalMaterial = metalMat;
    group.add(backpack);
    
    // Limbs
    const leftArmGroup = new THREE.Group();
    leftArmGroup.position.set(-0.55, 1.6, 0);
    const leftArm = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.8, 0.25), suitMat);
    leftArm.position.y = -0.4;
    leftArm.userData.originalMaterial = suitMat;
    leftArmGroup.add(leftArm);
    group.add(leftArmGroup);
    
    const rightArmGroup = new THREE.Group();
    rightArmGroup.position.set(0.55, 1.6, 0);
    const rightArm = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.8, 0.25), suitMat);
    rightArm.position.y = -0.4;
    rightArm.userData.originalMaterial = suitMat;
    rightArmGroup.add(rightArm);
    group.add(rightArmGroup);
    
    const leftLegGroup = new THREE.Group();
    leftLegGroup.position.set(-0.25, 0.7, 0);
    const leftLeg = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.8, 0.3), suitMat);
    leftLeg.position.y = -0.4;
    leftLeg.userData.originalMaterial = suitMat;
    leftLegGroup.add(leftLeg);
    group.add(leftLegGroup);
    
    const rightLegGroup = new THREE.Group();
    rightLegGroup.position.set(0.25, 0.7, 0);
    const rightLeg = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.8, 0.3), suitMat);
    rightLeg.position.y = -0.4;
    rightLeg.userData.originalMaterial = suitMat;
    rightLegGroup.add(rightLeg);
    group.add(rightLegGroup);
    
    group.userData.leftArm = leftArmGroup;
    group.userData.rightArm = rightArmGroup;
    group.userData.leftLeg = leftLegGroup;
    group.userData.rightLeg = rightLegGroup;
    group.userData.isWalking = false;
    group.userData.walkCycle = 0;
    
    return group;
}

function createMonsterModel() {
    const group = new THREE.Group();
    
    // Materials
    const darkMat = new THREE.MeshPhongMaterial({ color: 0x111111, flatShading: true });
    const redGlow = new THREE.MeshBasicMaterial({ color: 0xff0000 });
    
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.6, 1.8, 0.4), darkMat);
    torso.position.y = 2.0;
    torso.userData.originalMaterial = darkMat;
    group.add(torso);
    
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.6, 0.5), darkMat);
    head.position.set(0, 3.2, 0.1);
    head.userData.originalMaterial = darkMat;
    group.add(head);
    
    // Glowing eye slit
    const eye = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.1, 0.1), redGlow);
    eye.position.set(0, 3.3, -0.16);
    eye.userData.originalMaterial = redGlow;
    group.add(eye);
    
    const leftArmGroup = new THREE.Group();
    leftArmGroup.position.set(-0.45, 2.7, 0);
    const leftArm = new THREE.Mesh(new THREE.BoxGeometry(0.15, 2.4, 0.15), darkMat);
    leftArm.position.y = -1.2;
    leftArm.userData.originalMaterial = darkMat;
    leftArmGroup.add(leftArm);
    group.add(leftArmGroup);
    
    const rightArmGroup = new THREE.Group();
    rightArmGroup.position.set(0.45, 2.7, 0);
    const rightArm = new THREE.Mesh(new THREE.BoxGeometry(0.15, 2.4, 0.15), darkMat);
    rightArm.position.y = -1.2;
    rightArm.userData.originalMaterial = darkMat;
    rightArmGroup.add(rightArm);
    group.add(rightArmGroup);
    
    const leftLegGroup = new THREE.Group();
    leftLegGroup.position.set(-0.2, 1.1, 0);
    const leftLeg = new THREE.Mesh(new THREE.BoxGeometry(0.2, 1.4, 0.2), darkMat);
    leftLeg.position.y = -0.7;
    leftLeg.userData.originalMaterial = darkMat;
    leftLegGroup.add(leftLeg);
    group.add(leftLegGroup);
    
    const rightLegGroup = new THREE.Group();
    rightLegGroup.position.set(0.2, 1.1, 0);
    const rightLeg = new THREE.Mesh(new THREE.BoxGeometry(0.2, 1.4, 0.2), darkMat);
    rightLeg.position.y = -0.7;
    rightLeg.userData.originalMaterial = darkMat;
    rightLegGroup.add(rightLeg);
    group.add(rightLegGroup);
    
    group.userData.leftArm = leftArmGroup;
    group.userData.rightArm = rightArmGroup;
    group.userData.leftLeg = leftLegGroup;
    group.userData.rightLeg = rightLegGroup;
    group.userData.isWalking = false;
    group.userData.walkCycle = 0;
    
    return group;
}

function createGeneratorModel(id, isRepaired) {
    const group = new THREE.Group();
    group.userData = { id: id, isRepaired: isRepaired, isInteracting: false, engineBody: null, mainLight: null };

    // Costanti per il frame
    const frameW = 1.6;
    const frameH = 1.2;
    const frameD = 1.0;
    const pipeRadius = 0.03;
    const pipeMat = new THREE.MeshPhongMaterial({ color: 0x111111, shininess: 50 });

    // Funzioni helper per i tubi
    function createPipe(length, isVertical) {
        const geo = new THREE.CylinderGeometry(pipeRadius, pipeRadius, length, 8);
        const mesh = new THREE.Mesh(geo, pipeMat);
        if (!isVertical) mesh.rotation.z = Math.PI / 2;
        return mesh;
    }
    function createPipeZ(length) {
        const geo = new THREE.CylinderGeometry(pipeRadius, pipeRadius, length, 8);
        const mesh = new THREE.Mesh(geo, pipeMat);
        mesh.rotation.x = Math.PI / 2;
        return mesh;
    }

    // Telaio tubolare
    for(let x of [-frameW/2, frameW/2]) {
        for(let z of [-frameD/2, frameD/2]) {
            const pipe = createPipe(frameH, true);
            pipe.position.set(x, frameH/2, z);
            group.add(pipe);
        }
    }
    for(let y of [0, frameH]) {
        for(let z of [-frameD/2, frameD/2]) {
            const pipe = createPipe(frameW, false);
            pipe.position.set(0, y, z);
            group.add(pipe);
        }
    }
    for(let y of [0, frameH]) {
        for(let x of [-frameW/2, frameW/2]) {
            const pipe = createPipeZ(frameD);
            pipe.position.set(x, y, 0);
            group.add(pipe);
        }
    }

    // Serbatoio (Top Tank) bicolore
    const tankMatOr = new THREE.MeshPhongMaterial({ color: 0xff5500, shininess: 30 });
    const tankMatBl = new THREE.MeshPhongMaterial({ color: 0x222222, shininess: 30 });
    
    const tankLeft = new THREE.Mesh(new THREE.BoxGeometry((frameW - 0.1)*0.3, 0.25, frameD - 0.1), tankMatOr);
    tankLeft.position.set(-(frameW - 0.1)*0.35, frameH - 0.125, 0);
    group.add(tankLeft);
    
    const tankRight = new THREE.Mesh(new THREE.BoxGeometry((frameW - 0.1)*0.7, 0.25, frameD - 0.1), tankMatBl);
    tankRight.position.set((frameW - 0.1)*0.15, frameH - 0.125, 0);
    group.add(tankRight);

    // Tappo rosso (Fuel cap)
    const capGeo = new THREE.CylinderGeometry(0.08, 0.08, 0.05, 16);
    const capMat = new THREE.MeshPhongMaterial({ color: 0xcc0000 });
    const cap = new THREE.Mesh(capGeo, capMat);
    cap.position.set(-0.4, frameH, 0);
    group.add(cap);

    // Blocco Motore
    const engineGroup = new THREE.Group();
    
    // Corpo principale
    const engineMainGeo = new THREE.CylinderGeometry(0.35, 0.35, 0.8, 16);
    const engineMainMat = new THREE.MeshPhongMaterial({ color: 0x444444, shininess: 10 });
    const engineMain = new THREE.Mesh(engineMainGeo, engineMainMat);
    engineMain.rotation.z = Math.PI / 2;
    engineMain.position.set(0.1, frameH/2, 0);
    engineGroup.add(engineMain);

    // Carter arancione laterale (Pull Start)
    const pullStartGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.25, 16);
    pullStartGeo.rotateZ(Math.PI/2);
    const pullStart = new THREE.Mesh(pullStartGeo, tankMatOr);
    pullStart.position.set(-0.4, frameH/2, 0);
    engineGroup.add(pullStart);

    // Quadro elettrico
    const panelGeo = new THREE.BoxGeometry(0.3, 0.4, 0.5);
    const panelMat = new THREE.MeshPhongMaterial({ color: 0x111111 });
    const panel = new THREE.Mesh(panelGeo, panelMat);
    panel.position.set(0.6, frameH/2, 0.3);
    engineGroup.add(panel);

    group.add(engineGroup);
    group.userData.engineBody = engineGroup;

    // Luce di stato sul quadro
    const bulbGeo = new THREE.SphereGeometry(0.04, 8, 8);
    const bulbMat = new THREE.MeshPhongMaterial({
        color: isRepaired ? 0x00ff00 : 0xff0000,
        emissive: isRepaired ? 0x00ff00 : 0xff0000,
        emissiveIntensity: isRepaired ? 1.0 : 0.5
    });
    const bulb = new THREE.Mesh(bulbGeo, bulbMat);
    bulb.position.set(0.6, frameH/2 + 0.15, 0.55);
    engineGroup.add(bulb);
    group.userData.bulb = bulb;

    // Point Light (Distanza ridotta da 8 a 4 per ottimizzare le prestazioni delle luci)
    const pointLight = new THREE.PointLight(isRepaired ? 0x00ff00 : 0xff0000, isRepaired ? 2 : 0.5, 4);
    pointLight.position.set(0.6, frameH/2 + 0.15, 0.6);
    group.add(pointLight);
    group.userData.mainLight = pointLight;
    
    // Hitbox invisibile per il raycasting (così è facile da puntare)
    const hitBoxGeo = new THREE.BoxGeometry(frameW, frameH, frameD);
    const hitBoxMat = new THREE.MeshBasicMaterial({ visible: false });
    const hitBox = new THREE.Mesh(hitBoxGeo, hitBoxMat);
    hitBox.position.set(0, frameH/2, 0);
    hitBox.userData = { isHitBox: true };
    group.add(hitBox);

    // CPU Optimization: Disable raycasting on all the complex 3D parts (pipes, engines)
    group.traverse(child => {
        if (child.isMesh && !child.userData.isHitBox) {
            child.raycast = function() {}; // Skip raycasting
        }
    });

    // Scale giù l'intero modello per renderlo più piccolo ed evitare che compenetri i muri
    group.scale.set(0.6, 0.6, 0.6);

    return group;
}

export function updateGeneratorStatus(id) {
    const mesh = generatorMeshes.find(m => m.userData.id === id);
    if (mesh) {
        mesh.userData.isRepaired = true;
        mesh.userData.isInteracting = false;
        
        if (mesh.userData.bulb) {
            mesh.userData.bulb.material.color.setHex(0x00ff00);
            mesh.userData.bulb.material.emissive.setHex(0x00ff00);
            mesh.userData.bulb.material.emissiveIntensity = 1.0;
        }
        if (mesh.userData.mainLight) {
            mesh.userData.mainLight.color.setHex(0x00ff00);
            mesh.userData.mainLight.intensity = 2.0;
        }
    }
}

function isWall(x, z) {
    if (!currentGrid) return false;
    const gridX = Math.round(x / gridCellSize + gridWidth / 2);
    const gridZ = Math.round(z / gridCellSize + gridHeight / 2);
    
    // Bounds check
    if (gridX < 0 || gridX >= gridWidth || gridZ < 0 || gridZ >= gridHeight) return true; 
    
    return currentGrid[gridZ * gridWidth + gridX] === 0;
}

export function initGraphics() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x000000);
    scene.fog = new THREE.Fog(0x000000, 2, 20);

    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 25);
    camera.position.set(0, 1, 0);

    renderer = new THREE.WebGLRenderer({ 
        antialias: false,
        powerPreference: "high-performance",
        stencil: false,
        depth: true
    });
    renderer.setPixelRatio(1); // ALWAYS 1 to prevent massive retina 4K lag
    renderer.setSize(window.innerWidth, window.innerHeight);
    document.body.appendChild(renderer.domElement);
    
    controls = new PointerLockControls(camera, document.body);
    let lastPauseTime = 0;
    
    controls.addEventListener('lock', () => {
        document.getElementById("join-menu").classList.add("hidden");
        document.getElementById("pause-menu").classList.add("hidden");
        document.getElementById("hud-layer").classList.remove("hidden");
    });
    
    controls.addEventListener('unlock', () => {
        if (document.getElementById("minigame-layer").classList.contains("hidden")) {
            if (document.getElementById("join-menu").classList.contains("hidden")) {
                document.getElementById("pause-menu").classList.remove("hidden");
                document.getElementById("hud-layer").classList.add("hidden");
                lastPauseTime = Date.now();
            }
        }
    });

    window.addEventListener('keydown', (e) => {
        if (e.key === "Escape") {
            const pauseMenu = document.getElementById("pause-menu");
            if (!pauseMenu.classList.contains("hidden") && (Date.now() - lastPauseTime > 200)) {
                controls.lock();
            }
        }
    });

    // Floor and Ceiling (Grid geometry for wireframe effect)
    const planeGeo = new THREE.PlaneGeometry(100, 100, 25, 25);
    floorMesh = new THREE.Mesh(planeGeo, floorMaterial);
    floorMesh.rotation.x = -Math.PI / 2;
    scene.add(floorMesh);

    ceilingMesh = new THREE.Mesh(planeGeo, ceilingMaterial);
    ceilingMesh.rotation.x = Math.PI / 2;
    ceilingMesh.position.y = 4;
    scene.add(ceilingMesh);

    // Lights
    ambientLight = new THREE.AmbientLight(0xffffff, 0.05);
    scene.add(ambientLight);

    survivorLight = new THREE.SpotLight(0xfffaea, 200.0); // Very bright flashlight
    survivorLight.angle = Math.PI / 5;
    survivorLight.penumbra = 0.5;
    survivorLight.decay = 2;
    survivorLight.distance = 22;
    camera.add(survivorLight); 
    survivorLight.position.set(0, -0.2, 0);
    survivorLight.target.position.set(0, 0, -1);
    camera.add(survivorLight.target);
    scene.add(camera);

    // Inputs
    window.addEventListener('keydown', (e) => {
        if (keys.hasOwnProperty(e.key.toLowerCase())) keys[e.key.toLowerCase()] = true;
    });
    window.addEventListener('keyup', (e) => {
        if (keys.hasOwnProperty(e.key.toLowerCase())) keys[e.key.toLowerCase()] = false;
    });

    window.addEventListener('resize', () => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    });
}

export function lockControls() {
    if (controls) controls.lock();
}

export function unlockControls() {
    if (controls) controls.unlock();
}

export function setMap(mapData) {
    try {
        console.log("Setting map data:", mapData);
        if (mazeInstancedMesh) {
            scene.remove(mazeInstancedMesh);
        }
        if (mazeEdgesMesh) {
            scene.remove(mazeEdgesMesh);
        }

        const width = mapData.width || mapData.Width;
        const height = mapData.height || mapData.Height;
        const cellSize = mapData.cellSize || mapData.CellSize;
        const grid = mapData.grid || mapData.Grid;
        
        // Save for collision
        currentGrid = grid;
        gridWidth = width;
        gridHeight = height;
        gridCellSize = cellSize;
        
        const geometries = [];

        function isWall(gx, gy) {
            if (gx < 0 || gx >= width || gy < 0 || gy >= height) return true; // Treat bounds as walls so we don't draw outside edges
            return grid[gy * width + gx] === 0;
        }

        const wallHeight = 4;

        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                if (grid[y * width + x] === 0) {
                    const worldX = (x - width / 2) * cellSize;
                    const worldZ = (y - height / 2) * cellSize;
                    
                    // Top face
                    const topGeo = new THREE.PlaneGeometry(cellSize, cellSize);
                    topGeo.rotateX(-Math.PI / 2);
                    topGeo.translate(worldX, wallHeight, worldZ);
                    geometries.push(topGeo);

                    // Left face (X-)
                    if (!isWall(x - 1, y)) {
                        const geo = new THREE.PlaneGeometry(cellSize, wallHeight);
                        geo.rotateY(-Math.PI / 2);
                        geo.translate(worldX - cellSize / 2, wallHeight / 2, worldZ);
                        geometries.push(geo);
                    }
                    
                    // Right face (X+)
                    if (!isWall(x + 1, y)) {
                        const geo = new THREE.PlaneGeometry(cellSize, wallHeight);
                        geo.rotateY(Math.PI / 2);
                        geo.translate(worldX + cellSize / 2, wallHeight / 2, worldZ);
                        geometries.push(geo);
                    }
                    
                    // Front face (Z-)
                    if (!isWall(x, y - 1)) {
                        const geo = new THREE.PlaneGeometry(cellSize, wallHeight);
                        geo.rotateY(Math.PI);
                        geo.translate(worldX, wallHeight / 2, worldZ - cellSize / 2);
                        geometries.push(geo);
                    }
                    
                    // Back face (Z+)
                    if (!isWall(x, y + 1)) {
                        const geo = new THREE.PlaneGeometry(cellSize, wallHeight);
                        geo.translate(worldX, wallHeight / 2, worldZ + cellSize / 2);
                        geometries.push(geo);
                    }
                }
            }
        }

        const mergedGeo = BufferGeometryUtils.mergeGeometries(geometries);
        const mergedGeoWelded = BufferGeometryUtils.mergeVertices(mergedGeo, 0.1);
        mergedGeoWelded.computeVertexNormals();
        
        mazeInstancedMesh = new THREE.Mesh(mergedGeoWelded, wallMaterial);
        scene.add(mazeInstancedMesh);
        
        const edgesGeo = new THREE.EdgesGeometry(mergedGeoWelded, 1); // Extract angles > 1 deg
        mazeEdgesMesh = new THREE.LineSegments(edgesGeo, echolocationLineMaterial);
        scene.add(mazeEdgesMesh);

        // Clean up old generators
        generatorMeshes.forEach(m => scene.remove(m));
        generatorMeshes = [];

        // Spawn Generators
        const gens = mapData.generators || mapData.Generators;
        if (gens && currentRole !== "Monster") {
            gens.forEach(gen => {
                const isRepaired = gen.isRepaired || gen.IsRepaired;
                const mesh = createGeneratorModel(gen.id || gen.Id, isRepaired);
                const pos = gen.position || gen.Position;
                // Place on the floor (Y = 0)
                mesh.position.set(pos.x || pos.X, 0, pos.z || pos.Z);
                scene.add(mesh);
                generatorMeshes.push(mesh);
            });
        }

        applyRoleMaterials();
    } catch (e) {
        console.error("Critical error generating map:", e);
    }
}

function applyRoleMaterials() {
    if (currentRole === "Monster") {
        if (mazeInstancedMesh) mazeInstancedMesh.material = blackSolidMaterial;
        if (mazeEdgesMesh) mazeEdgesMesh.visible = true;
        
        if (floorMesh) floorMesh.material = blackSolidMaterial;
        if (ceilingMesh) ceilingMesh.material = blackSolidMaterial;
        
        survivorLight.visible = false;
        ambientLight.intensity = 0.0;
        scene.fog.near = 0.1;
        scene.fog.far = 1;
        
        for (const id in remotePlayerMeshes) {
            remotePlayerMeshes[id].traverse(c => {
                if (c.isMesh) c.material = survivorEchoMaterial;
            });
        }
    } else {
        if (mazeInstancedMesh) mazeInstancedMesh.material = wallMaterial;
        if (mazeEdgesMesh) mazeEdgesMesh.visible = false;
        
        if (floorMesh) floorMesh.material = floorMaterial;
        if (ceilingMesh) ceilingMesh.material = ceilingMaterial;
        
        survivorLight.visible = true;
        ambientLight.intensity = 0.1; 
        scene.fog.near = 2;
        scene.fog.far = 25;
        
        for (const id in remotePlayerMeshes) {
            remotePlayerMeshes[id].traverse(c => {
                if (c.isMesh && c.userData.originalMaterial) {
                    c.material = c.userData.originalMaterial;
                }
            });
        }
    }
}

export function setRole(newRole, id, x, y, z) {
    currentRole = newRole;
    localPlayerId = id;
    if (x !== undefined && y !== undefined && z !== undefined) {
        camera.position.set(x, y, z);
        playerPosition.x = x;
        playerPosition.y = y;
        playerPosition.z = z;
    }
    applyRoleMaterials();
}

export function updateState(state) {
    serverState = state;
    
    if (serverState.sounds && serverState.sounds.length > 0 && currentRole === "Monster") {
        const count = Math.min(serverState.sounds.length, maxSounds);
        sharedUniforms.uSoundCount.value = count;
        
        for (let i = 0; i < count; i++) {
            const s = serverState.sounds[i];
            sharedUniforms.uSoundPositions.value[i].set(s.position.x, s.position.y, s.position.z);
            sharedUniforms.uSoundStartTimes.value[i] = s.startTime;
            sharedUniforms.uSoundIntensities.value[i] = s.intensity;
        }
    }

    for (const [id, p] of Object.entries(serverState.players)) {
        if (id === localPlayerId) continue; 

        if (!remotePlayerMeshes[id]) {
            const role = p.role || p.Role || "Survivor";
            const mesh = role === "Monster" ? createMonsterModel() : createSurvivorModel();
            scene.add(mesh);
            remotePlayerMeshes[id] = mesh;
            
            if (currentRole === "Monster") {
                mesh.traverse(c => {
                    if (c.isMesh) c.material = survivorEchoMaterial;
                });
            }
        }
        
        const m = remotePlayerMeshes[id];
        const pPos = p.position || p.Position;
        
        if (m.userData.lastPosition) {
            const dist = m.userData.lastPosition.distanceTo(new THREE.Vector3(pPos.x || pPos.X, pPos.y || pPos.Y, pPos.z || pPos.Z));
            m.userData.isWalking = dist > 0.05;
        }
        m.userData.lastPosition = new THREE.Vector3(pPos.x || pPos.X, pPos.y || pPos.Y, pPos.z || pPos.Z);
        
        m.userData.targetPosition = { x: pPos.x || pPos.X, y: pPos.y || pPos.Y, z: pPos.z || pPos.Z };
        
        const rot = p.rotation || p.Rotation;
        if (rot) {
            m.userData.targetRotation = rot.y || rot.Y || 0;
        }
    }
}

const clock = new THREE.Clock();

export function animate() {
    requestAnimationFrame(animate);
    const delta = Math.min(clock.getDelta(), 0.1); // Cap delta to prevent huge jumps
    
    if (currentRole === "Monster") {
        sharedUniforms.uTime.value = Date.now() / 1000.0;
    }

    for (const id in remotePlayerMeshes) {
        const m = remotePlayerMeshes[id];
        if (m.userData.targetPosition) {
            m.position.lerp(new THREE.Vector3(m.userData.targetPosition.x, m.userData.targetPosition.y, m.userData.targetPosition.z), 0.2);
        }
        if (m.userData.targetRotation !== undefined) {
            // Smooth rotation interpolation
            const diff = m.userData.targetRotation - m.rotation.y;
            // Normalize angle to -PI to PI to prevent spinning
            const normalizedDiff = Math.atan2(Math.sin(diff), Math.cos(diff));
            m.rotation.y += normalizedDiff * 0.2;
        }
        
        // Procedural Animation
        if (m.userData.isWalking) {
            m.userData.walkCycle += delta * 10;
        } else {
            // Lerp back to idle
            m.userData.walkCycle += (0 - m.userData.walkCycle) * 0.1;
        }
        
        const swing = Math.sin(m.userData.walkCycle);
        if (m.userData.leftArm) m.userData.leftArm.rotation.x = swing * 0.8;
        if (m.userData.rightArm) m.userData.rightArm.rotation.x = -swing * 0.8;
        if (m.userData.leftLeg) m.userData.leftLeg.rotation.x = -swing * 0.8;
        if (m.userData.rightLeg) m.userData.rightLeg.rotation.x = swing * 0.8;
    }

    if (controls && controls.isLocked) {
        const oldX = camera.position.x;
        const oldZ = camera.position.z;

        direction.z = Number(keys.w) - Number(keys.s);
        direction.x = Number(keys.d) - Number(keys.a);
        direction.normalize(); 
        
        let speed = 3.5; // Realistic walking speed
        let isMoving = false;
        let isSprinting = false;

        const hasMovementKeys = (keys.w || keys.s || keys.a || keys.d);

        if (hasMovementKeys) {
            isMoving = true;
            // Sprint Logic
            if (keys.shift && !isExhausted && currentStamina > 0) {
                isSprinting = true;
                speed = 6.5; // Run speed
                currentStamina -= staminaDrainRate * delta;
                if (currentStamina <= 0) {
                    currentStamina = 0;
                    isExhausted = true;
                }
            }
        }

        // Regen Stamina
        if (!isSprinting) {
            currentStamina += staminaRegenRate * delta;
            if (currentStamina >= maxStamina) {
                currentStamina = maxStamina;
                isExhausted = false; // Recovered enough to sprint again
            }
        }

        // Update UI Bar (Vertical on the right)
        const fillEl = document.getElementById("stamina-fill");
        if (fillEl) {
            fillEl.style.height = (currentStamina / maxStamina * 100) + "%";
            fillEl.style.backgroundColor = isExhausted ? "#cc0000" : "#ffaa00"; // Red if exhausted
        }

        if (keys.w || keys.s) controls.moveForward(direction.z * speed * delta);
        if (keys.a || keys.d) controls.moveRight(direction.x * speed * delta);
        
        // Fluid Head Bobbing
        if (isMoving) {
            window.bobTime = (window.bobTime || 0) + delta * speed * 2.5; 
            // Smooth sine wave instead of absolute bounce
            camera.position.y = 1.0 + Math.sin(window.bobTime) * (isSprinting ? 0.15 : 0.08); 
        } else {
            camera.position.y += (1.0 - camera.position.y) * delta * 8.0; 
            if (Math.abs(camera.position.y - 1.0) < 0.01) window.bobTime = 0;
        }

        const newX = camera.position.x;
        const newZ = camera.position.z;
        const playerRadius = 0.6; // Hitbox radius
        
        // Check X axis wall collision
        if (isWall(newX + Math.sign(newX - oldX) * playerRadius, oldZ)) {
            camera.position.x = oldX; // Revert X
        }
        
        // Check Z axis wall collision
        if (isWall(camera.position.x, newZ + Math.sign(newZ - oldZ) * playerRadius)) {
            camera.position.z = oldZ; // Revert Z
        }
        
        playerPosition.x = camera.position.x;
        playerPosition.y = camera.position.y;
        playerPosition.z = camera.position.z;
    }

    // Particles update
    for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.position.addScaledVector(p.userData.velocity, delta);
        p.userData.velocity.y -= 15.0 * delta; // Gravity
        p.userData.life -= delta;
        p.scale.setScalar(Math.max(0, p.userData.life));
        if (p.userData.life <= 0) {
            scene.remove(p);
            // Free geometry/material
            p.geometry.dispose();
            p.material.dispose();
            particles.splice(i, 1);
        }
    }

    // Generator animations
    const t = Date.now() / 1000.0;
    generatorMeshes.forEach(mesh => {
        if (mesh.userData.isRepaired) {
            // Vibra il blocco motore
            if (mesh.userData.engineBody) {
                mesh.userData.engineBody.position.y = Math.sin(t * 50) * 0.01;
                mesh.userData.engineBody.position.x = Math.cos(t * 60) * 0.005;
            }
        } else if (mesh.userData.isInteracting) {
            // Little sparks from the engine/panel
            if (Math.random() < 0.2) {
                const pGeo = new THREE.BoxGeometry(0.05, 0.05, 0.05);
                const pMat = new THREE.MeshBasicMaterial({ color: 0xffddaa });
                const p = new THREE.Mesh(pGeo, pMat);
                p.position.copy(mesh.position);
                p.position.x += (Math.random() - 0.5) * 1.0;
                p.position.y += 0.5 + Math.random() * 0.3;
                p.position.z += (Math.random() - 0.5) * 1.0;
                p.userData = {
                    velocity: new THREE.Vector3((Math.random() - 0.5) * 4, Math.random() * 4, (Math.random() - 0.5) * 4),
                    life: 0.5
                };
                scene.add(p);
                particles.push(p);
            }
        } else {
            // Idle state: subtle red light pulsing
            if (mesh.userData.mainLight) {
                mesh.userData.mainLight.intensity = 0.5 + Math.sin(t * 2) * 0.2;
            }
        }
    });

    // Camera Shake
    if (cameraShake > 0) {
        camera.position.x += (Math.random() - 0.5) * cameraShake * 0.5;
        camera.position.y += (Math.random() - 0.5) * cameraShake * 0.5;
        camera.position.z += (Math.random() - 0.5) * cameraShake * 0.5;
        cameraShake -= delta;
        if (cameraShake < 0) {
            cameraShake = 0;
            // Snapping back happens naturally via player tracking in next frame
        }
    }

    // Raycasting for Generators (Only if survivor)
    if (currentRole !== "Monster" && generatorMeshes.length > 0) {
        raycaster.setFromCamera(centerVector, camera);
        const intersects = raycaster.intersectObjects(generatorMeshes);
        
        const crosshair = document.getElementById("crosshair");
        targetedGeneratorId = null;

        if (intersects.length > 0) {
            const hit = intersects[0];
            if (hit.distance < 2.5 && !hit.object.userData.isRepaired) {
                targetedGeneratorId = hit.object.userData.id;
                if (crosshair) crosshair.style.color = "#00ff00"; // Highlight green
            } else {
                if (crosshair) crosshair.style.color = "white";
            }
        } else {
            if (crosshair) crosshair.style.color = "white";
        }
    }

    // Smoothly interpolate remote players (removes perceived lag)
    for (const id in remotePlayerMeshes) {
        if (remotePlayerMeshes[id].targetPosition) {
            remotePlayerMeshes[id].position.lerp(remotePlayerMeshes[id].targetPosition, 0.2);
        }
    }

    renderer.render(scene, camera);
}
