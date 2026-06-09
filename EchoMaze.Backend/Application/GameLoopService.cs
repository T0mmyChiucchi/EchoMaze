using System;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.AspNetCore.SignalR;
using Microsoft.Extensions.Hosting;
using EchoMaze.Backend.Infrastructure;
using EchoMaze.Backend.Domain;

namespace EchoMaze.Backend.Application
{
    public class GameLoopService : BackgroundService
    {
        private readonly GameState _gameState;
        private readonly IHubContext<GameHub> _hubContext;
        private readonly TimeSpan _tickRate = TimeSpan.FromMilliseconds(50); // 20 ticks per second

        public GameLoopService(GameState gameState, IHubContext<GameHub> hubContext)
        {
            _gameState = gameState;
            _hubContext = hubContext;
        }

        protected override async Task ExecuteAsync(CancellationToken stoppingToken)
        {
            while (!stoppingToken.IsCancellationRequested)
            {
                var watch = System.Diagnostics.Stopwatch.StartNew();

                // Process pending sounds
                var newSounds = new List<SoundPulse>();
                while (_gameState.PendingSounds.TryDequeue(out var pulse))
                {
                    newSounds.Add(pulse);
                }

                // Create state snapshot
                var snapshot = new
                {
                    Players = _gameState.Players,
                    Sounds = newSounds
                };

                // Send to all clients
                if (!_gameState.Players.IsEmpty || newSounds.Count > 0)
                {
                    await _hubContext.Clients.All.SendAsync("UpdateState", snapshot, stoppingToken);
                }

                watch.Stop();
                var delay = _tickRate - watch.Elapsed;
                if (delay > TimeSpan.Zero)
                {
                    await Task.Delay(delay, stoppingToken);
                }
            }
        }
    }
}
