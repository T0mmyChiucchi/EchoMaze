using System.Collections.Concurrent;
using System.Collections.Generic;
using EchoMaze.Backend.Domain;

namespace EchoMaze.Backend.Application
{
    public class GameState
    {
        public ConcurrentDictionary<string, Player> Players { get; } = new ConcurrentDictionary<string, Player>();
        public ConcurrentQueue<SoundPulse> PendingSounds { get; } = new ConcurrentQueue<SoundPulse>();
        public MazeGenerator Maze { get; }
        public List<Generator> Generators { get; } = new List<Generator>();

        public GameState()
        {
            Maze = new MazeGenerator(21, 21); // Smaller maze
            Maze.Generate();

            // Spawn 4 generators spread out
            var positions = Maze.GetSpreadOutSpawnPositions(4);
            for (int i = 0; i < positions.Count; i++)
            {
                Generators.Add(new Generator 
                { 
                    Id = i, 
                    Position = positions[i], 
                    IsRepaired = false 
                });
            }
        }

        public bool MonsterExists()
        {
            foreach(var p in Players.Values) {
                if (p.Role == "Monster") return true;
            }
            return false;
        }
    }
}
