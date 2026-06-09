using System;
using System.Threading.Tasks;
using Microsoft.AspNetCore.SignalR;
using EchoMaze.Backend.Domain;

namespace EchoMaze.Backend.Infrastructure
{
    public class GameHub : Hub
    {
        private readonly Application.GameState _gameState;

        public GameHub(Application.GameState gameState)
        {
            _gameState = gameState;
        }

        public override async Task OnConnectedAsync()
        {
            // First player to join becomes Monster if none exists
            string role = _gameState.MonsterExists() ? "Survivor" : "Monster";
            
            var player = new Player 
            { 
                Id = Context.ConnectionId, 
                Role = role 
            };
            
            var spawnPos = _gameState.Maze.GetRandomValidSpawnPosition();
            player.Position = spawnPos;
            
            _gameState.Players.TryAdd(Context.ConnectionId, player);
            
            // Send map layout to the joining client
            await Clients.Caller.SendAsync("InitMap", new 
            { 
                Width = _gameState.Maze.Width, 
                Height = _gameState.Maze.Height, 
                CellSize = _gameState.Maze.CellSize,
                Grid = _gameState.Maze.GetFlatGrid(),
                Generators = _gameState.Generators
            });

            await Clients.Caller.SendAsync("AssignRole", role, player.Id, spawnPos.X, spawnPos.Y, spawnPos.Z);
            await base.OnConnectedAsync();
        }

        public override async Task OnDisconnectedAsync(Exception? exception)
        {
            _gameState.Players.TryRemove(Context.ConnectionId, out _);
            await base.OnDisconnectedAsync(exception);
        }

        public async Task MovePlayer(float x, float y, float z, float rotY)
        {
            var id = Context.ConnectionId;
            if (_gameState.Players.ContainsKey(id))
            {
                _gameState.Players[id].Position.X = x;
                _gameState.Players[id].Position.Y = y;
                _gameState.Players[id].Position.Z = z;
                _gameState.Players[id].Rotation.Y = rotY;
            }
        }

        public void SendVoiceNoise(float intensity)
        {
            if (_gameState.Players.TryGetValue(Context.ConnectionId, out var player))
            {
                // Create a sound pulse at the player's position
                var pulse = new SoundPulse
                {
                    Position = new Vector3Data { X = player.Position.X, Y = player.Position.Y, Z = player.Position.Z },
                    StartTime = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds() / 1000f,
                    Intensity = intensity,
                    Speed = 10f
                };
                
                _gameState.PendingSounds.Enqueue(pulse);
            }
        }

        public void MinigameFailed(float x, float y, float z)
        {
            // Huge noise when failing minigame
            var pulse = new SoundPulse
            {
                Position = new Vector3Data { X = x, Y = y, Z = z },
                StartTime = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds() / 1000f,
                Intensity = 5.0f, // Massive intensity
                Speed = 15f
            };
            _gameState.PendingSounds.Enqueue(pulse);
        }

        public async Task RepairGenerator(int generatorId)
        {
            var gen = _gameState.Generators.Find(g => g.Id == generatorId);
            if (gen != null && !gen.IsRepaired)
            {
                gen.IsRepaired = true;
                await Clients.All.SendAsync("GeneratorRepaired", generatorId);
                
                // Check if all are repaired
                bool allRepaired = _gameState.Generators.TrueForAll(g => g.IsRepaired);
                if (allRepaired)
                {
                    await Clients.All.SendAsync("AllGeneratorsRepaired");
                }
            }
        }
    }
}
