import { initGraphics, animate, updateState, playerPosition, setRole, setMap, lockControls, unlockControls, getCameraRotation, popSprintNoise } from './graphics.js';
import { startAudio } from './audio.js';
import { setupSignalR, sendPosition, sendMinigameFailed } from './network.js';
import { setupMinigame } from './minigame.js';

let role = "None";
let isGameStarted = false;

document.getElementById("start-btn").addEventListener("click", async () => {
    if (isGameStarted) {
        lockControls();
        return;
    }
    
    document.getElementById("status-text").innerText = "Requesting permissions...";
    
    try {
        // 1. MUST be synchronous: Init Graphics and request Pointer Lock
        initGraphics();
        lockControls();

        // 2. MUST be synchronous: Request Audio permission
        startAudio((volume) => {
            if (window.gameConnection && window.gameConnection.state === "Connected") {
                window.gameConnection.invoke("SendVoiceNoise", volume);
            }
        });
    } catch (e) {
        document.getElementById("status-text").innerText = "Error init: " + e.message;
        console.error(e);
        return;
    }

    document.getElementById("status-text").innerText = "Connecting to server...";

    
    // 3. Async: Start network
    const connection = await setupSignalR({
        onRoleAssigned: (assignedRole, id, x, y, z) => {
            role = assignedRole;
            document.getElementById("role-text").innerText = "Role: " + role;
            setRole(role, id, x, y, z);
        },
        onMapReceived: (mapData) => {
            setMap(mapData);
        },
        onStateUpdate: (state) => {
            updateState(state);
        },
        onGeneratorRepaired: (id) => {
            import('./graphics.js').then(g => g.updateGeneratorStatus(id));
        }
    });

    if (!connection) {
        document.getElementById("status-text").innerText = "Failed to connect to server.";
        unlockControls();
        return;
    }

    window.gameConnection = connection;

    document.getElementById("join-menu").classList.add("hidden");
    document.getElementById("hud-layer").classList.remove("hidden");

    // Minigame setup
    setupMinigame(
        () => { unlockControls(); }, // onOpen
        () => { lockControls(); },   // onClose
        () => {                      // onFail
            if (connection && connection.state === "Connected") {
                sendMinigameFailed(connection, playerPosition.x, playerPosition.y, playerPosition.z);
            }
        },
        () => {                      // onWin
            import('./graphics.js').then(g => {
                if (connection && connection.state === "Connected" && g.targetedGeneratorId !== null) {
                    import('./network.js').then(n => {
                        n.sendGeneratorRepaired(connection, g.targetedGeneratorId);
                    });
                }
            });
        }
    );

    // Game loop for sending position
    setInterval(() => {
        if (connection && connection.state === "Connected") {
            sendPosition(connection, playerPosition.x, playerPosition.y, playerPosition.z, getCameraRotation());
            if (popSprintNoise()) {
                connection.invoke("SendVoiceNoise", 2.0);
            }
        }
    }, 50); // 20hz update to server

    isGameStarted = true;
    
    // Render loop
    animate();
});

document.getElementById("resume-btn").addEventListener("click", () => {
    lockControls();
});


