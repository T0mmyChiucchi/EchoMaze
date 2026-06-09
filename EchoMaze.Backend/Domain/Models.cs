using System;

namespace EchoMaze.Backend.Domain
{
    public class Vector3Data
    {
        public float X { get; set; }
        public float Y { get; set; }
        public float Z { get; set; }
    }

    public class Player
    {
        public string Id { get; set; } = string.Empty;
        public string Role { get; set; } = "Survivor"; // "Survivor" or "Monster"
        public Vector3Data Position { get; set; } = new Vector3Data { X = 0, Y = 1, Z = 0 };
        public Vector3Data Rotation { get; set; } = new Vector3Data();
    }

    public class SoundPulse
    {
        public Vector3Data Position { get; set; } = new Vector3Data();
        public float StartTime { get; set; }
        public float Intensity { get; set; }
        public float Speed { get; set; } = 10f;
    }

    public class Generator
    {
        public int Id { get; set; }
        public Vector3Data Position { get; set; } = new Vector3Data();
        public bool IsRepaired { get; set; } = false;
    }
}
