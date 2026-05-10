import { io } from "socket.io-client";

// MUST be valid Mongo ObjectId format (24 chars)
const USER_ID = "64a7f1c2b9d3e8f1a2c4d5e6";
const AI_ID = "000000000000000000000001";

const socket = io("http://localhost:5000", {
    query: {
        userId: USER_ID
    }
});

socket.on("connect", () => {
    console.log("Connected:", socket.id);

    socket.emit("sendMessage", {
        message: "Hello AI",
        receiverId: AI_ID
    });
});

socket.on("receiveMessage", (data) => {
    console.log("Message:", data);
});

socket.on("typing", (data) => {
    console.log("Typing:", data);
});