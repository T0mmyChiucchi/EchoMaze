import * as signalR from '@microsoft/signalr';

export async function setupSignalR(callbacks) {
    const connection = new signalR.HubConnectionBuilder()
        .withUrl("http://localhost:5202/gameHub")
        .withAutomaticReconnect()
        .build();

    connection.on("AssignRole", (role, id, x, y, z) => {
        console.log("Assigned role:", role, id, "spawn:", x, y, z);
        callbacks.onRoleAssigned(role, id, x, y, z);
    });

    connection.on("InitMap", (mapData) => {
        console.log("Map received", mapData);
        callbacks.onMapReceived(mapData);
    });

    connection.on("UpdateState", (state) => {
        callbacks.onStateUpdate(state);
    });

    connection.on("GeneratorRepaired", (id) => {
        if(callbacks.onGeneratorRepaired) callbacks.onGeneratorRepaired(id);
    });

    connection.on("AllGeneratorsRepaired", () => {
        if(callbacks.onAllGeneratorsRepaired) callbacks.onAllGeneratorsRepaired();
    });

    try {
        await connection.start();
        console.log("SignalR Connected.");
        return connection;
    } catch (err) {
        console.error("SignalR Connection Error: ", err);
        return null;
    }
}

export function sendPosition(connection, x, y, z, rotY) {
    connection.invoke("MovePlayer", x, y, z, rotY).catch(err => console.error(err));
}

export function sendMinigameFailed(connection, x, y, z) {
    connection.invoke("MinigameFailed", x, y, z).catch(err => console.error(err));
}

export function sendGeneratorRepaired(connection, id) {
    connection.invoke("RepairGenerator", id).catch(err => console.error(err));
}
