🦇 EchoMaze

EchoMaze is an asymmetrical multiplayer horror-survival game. Set in a pitch-black, dynamically generated labyrinth, the game puts a team of desperate Survivors against a terrifying, blind Monster that hunts entirely by using echolocation.

🎮 Gameplay & Roles

The Survivors:

- Objective: Explore the pitch-black maze to locate and repair 4 malfunctioning generators spread out across the map.
- Mechanics: Survivors are equipped with a flashlight and must manage a Stamina System. Sprinting helps you escape, but it generates noise pulses.
- Minigames: To repair a generator, survivors must complete an interactive wire-connecting minigame. Failing the minigame causes the generator to backfire, violently shaking the camera and emitting a massive sound wave that gives away their position.

The Monster:

- Objective: Hunt down the Survivors before they can repair the generators.
- Unique Vision System (Echolocation): The Monster is completely blind to the normal world and operates in total darkness. It relies on a custom-built Echolocation Shader. When survivors sprint, fail minigames, or make noise, a red sonar wave expands through the 3D space. The wave briefly illuminates the maze walls and highlights the survivors—even through walls—allowing the Monster to track its prey.

🛠️ Technical Architecture

Backend:

- Procedural Maze Generation: The server uses a Depth-First Search (Recursive Backtracker) algorithm to generate the maze grid. It intentionally breaks random walls to create loops, ensuring the maze acts as a graph rather than a dead-end tree, allowing for flanking and continuous chases.
- Real-time State Sync: Manages player positions, roles, generator repair statuses, and global sound pulse queues, broadcasting state instantly to all clients.
- Spawn Logic: Algorithmically calculates the optimal spawn locations for the 4 generators to ensure they are evenly spread out across the extremities of the maze.

Frontend:

- Custom Shaders: Utilizes advanced GLSL fragment shaders to render the sonar-like echolocation waves. The shader calculates wave propagation speed, distance attenuation, and intersection with world geometry and player models.
- Rendering: Built on Three.js utilizing optimized MeshPhongMaterial and Instanced Meshes for high-performance labyrinth rendering.
- Custom 3D Models: Features procedural geometry models for survivors and generators, with support for animated GLTF models for the Monster.
