import express from "express";
import { protectRoute } from "../middleware/auth.js";
import { clearChat, deleteMessage, getMessages, getUsersForSidebar, markMessageAsSeen, sendMessage } from "../controllers/messageController.js";

const messageRouter = express.Router();

messageRouter.get("/users", protectRoute, getUsersForSidebar);
messageRouter.get("/:id", protectRoute, getMessages);
messageRouter.put("/mark/:id", protectRoute, markMessageAsSeen);
// messageRouter.put("mark/:id", protectRoute, markMessageAsSeen);
messageRouter.post("/send/:id", protectRoute, sendMessage);
messageRouter.delete("/clear/:id", protectRoute, clearChat);
messageRouter.delete("/:id", protectRoute, deleteMessage);


export default messageRouter;
