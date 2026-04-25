import express from "express";
import "dotenv/config";
import cors from "cors";
import http from "http";
import connectDB from "./lib/db.js";
import userRouter from "./routes/userRoutes.js";
import messageRouter from "./routes/messageRoutes.js";
import { Server } from "socket.io";


//Express app and HTTP server
const app = express();
const server = http.createServer(app);

//Initialize Socket.IO server
export const io = new Server(server, {
  cors: { origin: "*" }
})

//Store online users 
// export const userSocketMap = {};  // { userId: socketId }

// // Socket.IO connection handling
// io.on("connection", (socket) => {
//   const userId = socket.handshake.query.userId;
//   console.log("User Connected", userId);
//   if (userId) userSocketMap[userId] = socket.id;

//   //Emit online users to all clients
//   io.emit("getOnlineUsers", Object.keys(userSocketMap));
//   socket.on("disconnect", () => {
//     console.log("User Disconnected", userId);
//     delete userSocketMap[userId];
//     io.emit("getOnlineUsers", Object.keys(userSocketMap));
//   });

// });

// Store online users 
export const userSocketMap = {};
// { userId: [socketId1, socketId2] }

io.on("connection", (socket) => {
  const userId = socket.handshake.query.userId;

  console.log("User Connected", userId);

  // ✅ ADD socket
  if (userId) {
    if (!userSocketMap[userId]) {
      userSocketMap[userId] = [];
    }
    userSocketMap[userId].push(socket.id);
  }

  // ✅ Emit online users
  io.emit("getOnlineUsers", Object.keys(userSocketMap));

  socket.on("disconnect", () => {
    console.log("User Disconnected", userId);

    if (userId && userSocketMap[userId]) {
      // remove only this socket
      userSocketMap[userId] = userSocketMap[userId].filter(
        (id) => id !== socket.id
      );

      // remove user only if no sockets left
      if (userSocketMap[userId].length === 0) {
        delete userSocketMap[userId];
      }
    }

    io.emit("getOnlineUsers", Object.keys(userSocketMap));
  });
});




// Middleware setup 
app.use(express.json({ limit: "4mb" }));
app.use(cors());

// Routes setup

app.get("/", (req, res) => {
  res.send("Chat App Backend Running 🚀");
});

app.use("/api/status", (req, res) => {
  res.send('Server is Alive!')
});

app.use("/api/auth", userRouter);
app.use("/api/messages", messageRouter);


// Connect to MongoDB
await connectDB();

// Start server
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});