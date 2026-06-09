using EchoMaze.Backend.Application;
using EchoMaze.Backend.Infrastructure;
using Microsoft.AspNetCore.Builder;
using Microsoft.Extensions.DependencyInjection;

var builder = WebApplication.CreateBuilder(args);

// Add services to the container.
builder.Services.AddCors(options =>
{
    options.AddPolicy("AllowAll", builder =>
    {
        builder.AllowAnyMethod()
               .AllowAnyHeader()
               .SetIsOriginAllowed(_ => true)
               .AllowCredentials();
    });
});

builder.Services.AddSignalR();
builder.Services.AddSingleton<GameState>();
builder.Services.AddHostedService<GameLoopService>();

var app = builder.Build();

app.UseCors("AllowAll");
app.MapHub<GameHub>("/gameHub");

app.MapGet("/", () => "EchoMaze Backend is running!");

app.Run();
