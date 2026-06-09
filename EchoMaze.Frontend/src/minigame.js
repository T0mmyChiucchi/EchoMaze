import { targetedGeneratorId, setGeneratorInteracting, triggerGeneratorFail } from './graphics.js';

export function setupMinigame(onOpenCallback, onCloseCallback, onFailCallback, onWinCallback) {
    const minigameLayer = document.getElementById("minigame-layer");
    const closeBtn = document.getElementById("close-minigame-btn");
    
    const leftCol = document.getElementById("left-wires");
    const rightCol = document.getElementById("right-wires");
    const canvas = document.getElementById("wire-canvas");
    const ctx = canvas.getContext("2d");

    const colors = ["#ff0000", "#00ff00", "#0000ff", "#ffff00"];
    let leftNodes = [];
    let rightNodes = [];
    let connections = {}; // leftIndex -> rightIndex
    let selectedLeft = null;
    let mouseX = 0;
    let mouseY = 0;
    let currentGenId = null;

    minigameLayer.addEventListener('mousemove', (e) => {
        if (minigameLayer.classList.contains("hidden")) return;
        const rect = canvas.getBoundingClientRect();
        mouseX = e.clientX - rect.left;
        mouseY = e.clientY - rect.top;
        if (selectedLeft !== null) {
            drawConnections();
        }
    });

    function resizeCanvas() {
        canvas.width = canvas.parentElement.clientWidth;
        canvas.height = canvas.parentElement.clientHeight;
        drawConnections();
    }

    function drawConnections() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.lineWidth = 5;
        
        for (let l = 0; l < 4; l++) {
            const leftNode = leftCol.children[l];
            if (!leftNode) continue;
            
            const lx = leftNode.offsetLeft + leftNode.offsetWidth;
            const ly = leftNode.offsetTop + leftNode.offsetHeight / 2;

            if (connections[l] !== undefined) {
                const r = connections[l];
                const rightNode = rightCol.children[r];
                const rx = rightNode.offsetLeft;
                const ry = rightNode.offsetTop + rightNode.offsetHeight / 2;

                ctx.strokeStyle = leftNodes[l];
                ctx.beginPath();
                ctx.moveTo(lx, ly);
                ctx.lineTo(rx, ry);
                ctx.stroke();
            } else if (selectedLeft === l) {
                ctx.strokeStyle = leftNodes[l];
                ctx.beginPath();
                ctx.moveTo(lx, ly);
                ctx.lineTo(mouseX, mouseY);
                ctx.stroke();
            }
        }
    }

    function checkWin() {
        let correct = 0;
        let total = 0;
        for (let l = 0; l < 4; l++) {
            if (connections[l] !== undefined) {
                total++;
                if (leftNodes[l] === rightNodes[connections[l]]) correct++;
            }
        }

        if (total === 4) {
            if (correct === 4) {
                minigameLayer.classList.add("hidden");
                if (currentGenId !== null) setGeneratorInteracting(currentGenId, false);
                onWinCallback();
                onCloseCallback();
            } else {
                // Fail
                minigameLayer.classList.add("hidden");
                if (currentGenId !== null) {
                    setGeneratorInteracting(currentGenId, false);
                    triggerGeneratorFail(currentGenId);
                }
                onFailCallback();
                onCloseCallback();
            }
        }
    }

    function handleLeftClick(index, element) {
        if (selectedLeft !== null) leftCol.children[selectedLeft].classList.remove("selected");
        selectedLeft = index;
        element.classList.add("selected");
    }

    function handleRightClick(index) {
        if (selectedLeft !== null) {
            connections[selectedLeft] = index;
            leftCol.children[selectedLeft].classList.remove("selected");
            selectedLeft = null;
            drawConnections();
            checkWin();
        }
    }

    function initGame() {
        leftCol.innerHTML = "";
        rightCol.innerHTML = "";
        connections = {};
        selectedLeft = null;
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        leftNodes = [...colors].sort(() => Math.random() - 0.5);
        rightNodes = [...colors].sort(() => Math.random() - 0.5);

        for (let i = 0; i < 4; i++) {
            const lNode = document.createElement("div");
            lNode.className = "wire-node";
            lNode.style.backgroundColor = leftNodes[i];
            lNode.onclick = () => handleLeftClick(i, lNode);
            leftCol.appendChild(lNode);

            const rNode = document.createElement("div");
            rNode.className = "wire-node";
            rNode.style.backgroundColor = rightNodes[i];
            rNode.onclick = () => handleRightClick(i);
            rightCol.appendChild(rNode);
        }
        
        setTimeout(() => {
            resizeCanvas();
            drawConnections();
        }, 50);
    }

    // Open minigame with 'E'
    window.addEventListener("keydown", (e) => {
        if (e.key === "e" || e.key === "E") {
            if (minigameLayer.classList.contains("hidden") && targetedGeneratorId !== null) {
                currentGenId = targetedGeneratorId;
                minigameLayer.classList.remove("hidden");
                setGeneratorInteracting(currentGenId, true);
                initGame();
                onOpenCallback();
            }
        }
    });

    closeBtn.addEventListener("click", () => {
        minigameLayer.classList.add("hidden");
        if (currentGenId !== null) {
            setGeneratorInteracting(currentGenId, false);
        }
        onCloseCallback();
    });
    
    window.addEventListener('resize', resizeCanvas);
    
    window.addEventListener('resize', resizeCanvas);
}

