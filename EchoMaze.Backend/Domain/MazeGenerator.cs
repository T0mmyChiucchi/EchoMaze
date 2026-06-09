using System;
using System.Collections.Generic;

namespace EchoMaze.Backend.Domain
{
    public class MazeGenerator
    {
        // 0 = wall, 1 = path
        public int[,] Grid { get; private set; }
        public int Width { get; }
        public int Height { get; }
        public float CellSize { get; } = 3.0f; // Size of each cell in 3D world units (was 4.0f)

        private Random _random = new Random();

        public MazeGenerator(int width = 31, int height = 31)
        {
            // Ensure odd dimensions for proper wall generation
            Width = width % 2 == 0 ? width + 1 : width;
            Height = height % 2 == 0 ? height + 1 : height;
            Grid = new int[Width, Height];
        }

        public void Generate()
        {
            // Initialize everything as walls
            for (int x = 0; x < Width; x++)
            {
                for (int y = 0; y < Height; y++)
                {
                    Grid[x, y] = 0;
                }
            }

            // Depth First Search (Recursive Backtracker)
            Stack<(int x, int y)> stack = new Stack<(int x, int y)>();
            int startX = 1;
            int startY = 1;

            Grid[startX, startY] = 1;
            stack.Push((startX, startY));

            while (stack.Count > 0)
            {
                var current = stack.Peek();
                var neighbors = GetUnvisitedNeighbors(current.x, current.y);

                if (neighbors.Count > 0)
                {
                    var next = neighbors[_random.Next(neighbors.Count)];
                    
                    // Remove wall between current and next
                    int wallX = current.x + (next.x - current.x) / 2;
                    int wallY = current.y + (next.y - current.y) / 2;
                    
                    Grid[wallX, wallY] = 1; // path
                    Grid[next.x, next.y] = 1; // path
                    
                    stack.Push(next);
                }
                else
                {
                    stack.Pop();
                }
            }

            // Open a few random loops to make it a graph rather than a perfect tree
            for (int i = 0; i < (Width * Height) / 20; i++)
            {
                int rx = _random.Next(1, Width - 1);
                int ry = _random.Next(1, Height - 1);
                Grid[rx, ry] = 1;
            }
        }

        private List<(int x, int y)> GetUnvisitedNeighbors(int x, int y)
        {
            var neighbors = new List<(int x, int y)>();

            if (x >= 3 && Grid[x - 2, y] == 0) neighbors.Add((x - 2, y));
            if (x <= Width - 4 && Grid[x + 2, y] == 0) neighbors.Add((x + 2, y));
            if (y >= 3 && Grid[x, y - 2] == 0) neighbors.Add((x, y - 2));
            if (y <= Height - 4 && Grid[x, y + 2] == 0) neighbors.Add((x, y + 2));

            return neighbors;
        }

        public List<Vector3Data> GetSpreadOutSpawnPositions(int count)
        {
            List<(int x, int y)> validCells = new List<(int x, int y)>();
            for (int x = 1; x < Width - 1; x++)
            {
                for (int y = 1; y < Height - 1; y++)
                {
                    if (Grid[x, y] == 1)
                    {
                        validCells.Add((x, y));
                    }
                }
            }

            if (validCells.Count == 0) return new List<Vector3Data>();

            List<Vector3Data> results = new List<Vector3Data>();
            
            // Pick first one completely randomly
            var firstCell = validCells[_random.Next(validCells.Count)];
            results.Add(CellToWorld(firstCell.x, firstCell.y));
            
            // For the rest, find the cell that maximizes distance to the closest already picked point
            for (int i = 1; i < count; i++)
            {
                (int x, int y) bestCell = validCells[0];
                float maxMinDist = -1;

                foreach (var cell in validCells)
                {
                    var worldPos = CellToWorld(cell.x, cell.y);
                    float minDistToAny = float.MaxValue;

                    foreach (var existing in results)
                    {
                        float dist = (float)Math.Sqrt(Math.Pow(worldPos.X - existing.X, 2) + Math.Pow(worldPos.Z - existing.Z, 2));
                        if (dist < minDistToAny)
                        {
                            minDistToAny = dist;
                        }
                    }

                    if (minDistToAny > maxMinDist)
                    {
                        maxMinDist = minDistToAny;
                        bestCell = cell;
                    }
                }

                results.Add(CellToWorld(bestCell.x, bestCell.y));
                // Remove to prevent picking same cell twice just in case
                validCells.Remove(bestCell);
            }

            return results;
        }

        private Vector3Data CellToWorld(int x, int y)
        {
            float worldX = (x - Width / 2.0f) * CellSize;
            float worldZ = (y - Height / 2.0f) * CellSize;
            return new Vector3Data { X = worldX, Y = 1, Z = worldZ };
        }

        public Vector3Data GetRandomValidSpawnPosition()
        {
            List<(int x, int y)> validCells = new List<(int x, int y)>();
            for (int x = 1; x < Width - 1; x++)
            {
                for (int y = 1; y < Height - 1; y++)
                {
                    if (Grid[x, y] == 1)
                    {
                        validCells.Add((x, y));
                    }
                }
            }

            if (validCells.Count == 0) return new Vector3Data { X = 0, Y = 1, Z = 0 };
            var cell = validCells[_random.Next(validCells.Count)];
            return CellToWorld(cell.x, cell.y);
        }
        
        // Return 1D array of grid for easier transmission via SignalR JSON
        public int[] GetFlatGrid()
        {
            int[] flat = new int[Width * Height];
            for (int y = 0; y < Height; y++)
            {
                for (int x = 0; x < Width; x++)
                {
                    flat[y * Width + x] = Grid[x, y];
                }
            }
            return flat;
        }
    }
}
