import express from "express";
import "dotenv/config";
import cors from "cors";
import http from "http";
import connectDB from "./lib/db.js";
import userRouter from "./routes/userRoutes.js";
import messageRouter from "./routes/messageRoutes.js";
import { Server } from "socket.io";
import { askAIStream } from "./services/aiService.js";
import User from "./models/User.js";
import Message from "./models/message.js";


const AI_USER_ID = "000000000000000000000001";

const createAIUserIfNotExists = async () => {
  const exists = await User.findById(AI_USER_ID);

  if (!exists) {
    await User.create({
      _id: AI_USER_ID,
      email: "ai@chat.com",
      fullName: "AI Assistant",
      password: "dummy123",
      profilePic: "",
      bio: "I am your AI assistant"
    });

    console.log("🤖 AI user created");
  }
};
//Express app and HTTP server
const app = express();
const server = http.createServer(app);

//Initialize Socket.IO server
export const io = new Server(server, {
  cors: { origin: "*" }
})


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


  // ==============================
  // 🔥 AI CHAT ADD HERE
  // ==============================
  socket.on("sendMessage", async (data) => {
    const { message, receiverId } = data;

    if (!message || !receiverId) return;
    if (userId === AI_USER_ID) return;

    if (receiverId === AI_USER_ID) {
      try {
        socket.emit("typing", true);

        // 1. Get last messages (memory)
        let messages = await Message.find({
          $or: [
            { senderId: userId, receiverId: AI_USER_ID },
            { senderId: AI_USER_ID, receiverId: userId }
          ]
        })
          .sort({ createdAt: -1 })
          .limit(10)
          .lean();

        messages = messages.reverse(); // chronological order

        // 2. Format memory
        const formattedMessages = messages.map((msg) => ({
          role:
            msg.senderId.toString() === AI_USER_ID ? "assistant" : "user",
          content: msg.text
        }));

        formattedMessages.push({
          role: "user",
          content: message
        });

        let streamedText = "";

        // 3. Streaming AI
        await askAIStream(formattedMessages, (chunk, fullText) => {
          streamedText = fullText;

          socket.emit("receiveMessage", {
            senderId: AI_USER_ID,
            receiverId: userId,
            text: streamedText,
            isStreaming: true
          });
        });

        socket.emit("typing", false);

        // 4. Save final message
        await Message.create({
          senderId: AI_USER_ID,
          receiverId: userId,
          text: streamedText
        });

        // 5. Final stop signal
        socket.emit("receiveMessage", {
          senderId: AI_USER_ID,
          receiverId: userId,
          text: streamedText,
          isStreaming: false
        });

      } catch (err) {
        console.log("AI Error:", err);

        socket.emit("typing", false);

        socket.emit("receiveMessage", {
          senderId: AI_USER_ID,
          receiverId: userId,
          text: "AI is currently unavailable",
          isStreaming: false
        });
      }
    }
  });

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
// await connectDB();

// Start server
// const PORT = process.env.PORT || 5000;
// server.listen(PORT, () => {
//   console.log(`Server running on http://localhost:${PORT}`);
// });

const startServer = async () => {
  await connectDB();
  await createAIUserIfNotExists();

  const PORT = process.env.PORT || 5000;

  server.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on port ${PORT}`);
  });
};

startServer();