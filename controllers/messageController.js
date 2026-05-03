import mongoose from "mongoose";
import Message from "../models/message.js";
import User from "../models/User.js";
import cloudinary from "../lib/cloudinary.js";
import { io, userSocketMap } from "../server.js";

// Helper: emit to all sockets of a user (userSocketMap stores arrays)
const emitToUser = (userId, event, data) => {
  const socketIds = userSocketMap[userId?.toString()];
  if (socketIds && socketIds.length > 0) {
    socketIds.forEach((socketId) => io.to(socketId).emit(event, data));
  }
};

// Get all users except the logged in user for sidebar display
export const getUsersForSidebar = async (req, res) => {
  try {
    const userId = req.user._id;
    const filteredUsers = await User.find({ _id: { $ne: userId } }).select("-password");

    // Count unseen messages for each user
    const unseenMessages = {};
    const promises = filteredUsers.map(async (user) => {
      const messages = await Message.find({ senderId: user._id, receiverId: userId, seen: false });
      if (messages.length > 0) {
        unseenMessages[user._id] = messages.length;
      }
    });
    await Promise.all(promises);

    res.status(200).json({ success: true, users: filteredUsers, unseenMessages });
  } catch (error) {
    console.log("Get Users Error:", error.message);
    res.status(500).json({ success: false, message: error.message });
  }
};

// Get all messages for selected user
export const getMessages = async (req, res) => {
  try {
    const { id: selectedUserId } = req.params;
    const myId = req.user._id;

    // FIX #1: Mark as seen BEFORE fetching — so response reflects correct seen:true state
    await Message.updateMany(
      { senderId: selectedUserId, receiverId: myId, seen: false },
      { $set: { seen: true } }
    );

    // FIX #3: Notify the sender that their messages have been seen (real-time blue ticks)
    emitToUser(selectedUserId, "messagesSeen", { by: myId.toString() });

    const messages = await Message.find({
      $or: [
        { senderId: myId, receiverId: selectedUserId },
        { senderId: selectedUserId, receiverId: myId },
      ],
      deletedFor: { $ne: myId },
    });

    res.status(200).json({ success: true, messages });
  } catch (error) {
    console.log("Get Messages Error:", error.message);
    res.status(500).json({ success: false, message: error.message });
  }
};

// API to mark a single message as seen using message id
export const markMessageAsSeen = async (req, res) => {
  try {
    const { id } = req.params;
    const myId = req.user._id;

    const message = await Message.findById(id);
    if (!message) {
      return res.status(404).json({ success: false, message: "Message not found" });
    }

    // FIX #2: Only the actual receiver can mark a message as seen
    if (message.receiverId.toString() !== myId.toString()) {
      return res.status(403).json({ success: false, message: "Not authorized" });
    }

    // Avoid duplicate DB writes — only update if not already seen
    if (!message.seen) {
      message.seen = true;
      await message.save();

      // FIX #3 + #4: Emit to ALL sender sockets so blue ticks update in real-time
      emitToUser(message.senderId.toString(), "messageSeen", { messageId: id });
    }

    res.status(200).json({ success: true, message: "Message marked as seen" });
  } catch (error) {
    console.log("Mark Message Seen Error:", error.message);
    res.status(500).json({ success: false, message: error.message });
  }
};

// Send message to selected user
export const sendMessage = async (req, res) => {
  try {
    const { text, image } = req.body;
    const receiverId = req.params.id;
    const senderId = req.user._id;

    const userExists = await User.findById(receiverId);
    if (!userExists) {
      return res.status(404).json({ success: false, message: "Receiver not found" });
    }

    if (!text && !image) {
      return res.status(400).json({ success: false, message: "Message cannot be empty" });
    }

    let imageUrl;
    if (image) {
      const uploadResponse = await cloudinary.uploader.upload(image);
      imageUrl = uploadResponse.secure_url;
    }

    const newMessage = await Message.create({ senderId, receiverId, text, image: imageUrl });

    // FIX #4: userSocketMap is an array — emit to ALL receiver sockets
    emitToUser(receiverId, "newMessage", newMessage);

    res.status(201).json({ success: true, message: newMessage });
  } catch (error) {
    console.log("Send Message Error:", error.message);
    res.status(500).json({ success: false, message: "Internal Server Error" });
  }
};

// Delete message
export const deleteMessage = async (req, res) => {
  try {
    const { id } = req.params;
    const { delete_for_everyone } = req.body;
    const myId = req.user._id;

    const message = await Message.findById(id);
    if (!message) {
      return res.status(404).json({ success: false, message: "Message not found" });
    }

    if (delete_for_everyone) {
      if (message.senderId.toString() !== myId.toString()) {
        return res.status(403).json({ success: false, message: "You can only delete your own messages for everyone" });
      }

      message.isDeleted = true;
      message.text = "";
      message.image = "";
      await message.save();

      const otherUserId = message.receiverId.toString() === myId.toString()
        ? message.senderId
        : message.receiverId;

      // FIX #4: use emitToUser helper
      emitToUser(otherUserId.toString(), "messageDeleted", { messageId: id });
    } else {
      if (!message.deletedFor.includes(myId)) {
        message.deletedFor.push(myId);
        await message.save();
      }
    }

    res.status(200).json({ success: true, message: "Message deleted successfully" });
  } catch (error) {
    console.log("Delete Message Error:", error.message);
    res.status(500).json({ success: false, message: error.message });
  }
};

// Clear all messages in a chat
export const clearChat = async (req, res) => {
  try {
    const { id: selectedUserId } = req.params;
    const myId = req.user._id;

    if (!mongoose.Types.ObjectId.isValid(selectedUserId)) {
      return res.status(400).json({ success: false, message: "Invalid selected user ID" });
    }

    const result = await Message.updateMany(
      {
        $or: [
          { senderId: myId, receiverId: selectedUserId },
          { senderId: selectedUserId, receiverId: myId },
        ],
        deletedFor: { $ne: myId },
      },
      { $addToSet: { deletedFor: myId } }
    );

    res.status(200).json({ success: true, message: "Chat cleared successfully", count: result.modifiedCount });
  } catch (error) {
    console.log("Clear Chat Error:", error.message);
    res.status(500).json({ success: false, message: "Internal Server Error" });
  }
};
