import mongoose from "mongoose";
import Message from "../models/message.js";
import User from "../models/User.js";
import cloudinary from "../lib/cloudinary.js";
import { io, userSocketMap } from "../server.js";

// Get all users except the logged in user for sidebar display
export const getUsersForSidebar = async (req, res) => {
  try {
    const userId = req.user._id;
    const filteredUsers = await User.find({ _id: { $ne: userId } }).select("-password");

    //Count unseen messages for each user
    const unseenMessages = {};
    const promises = filteredUsers.map(async (user) => {
      const messages = await Message.find({ senderId: user._id, receiverId: userId, seen: false });

      if (messages.length > 0) {
        unseenMessages[user._id] = messages.length;
      }
    })
    await Promise.all(promises);
    res.status(200).json({
      success: true,
      users: filteredUsers,
      unseenMessages,
    });
  } catch (error) {
    console.log("Get Users Error:", error.message);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
}


//Get all messages for selected user

export const getMessages = async (req, res) => {
  try {
    const { id: selectedUserId } = req.params;
    const myId = req.user._id;

    const messages = await Message.find({
      $or: [
        { senderId: myId, receiverId: selectedUserId },
        { senderId: selectedUserId, receiverId: myId },
      ],
      deletedFor: { $ne: myId },
    })
    // await Message.updateMany(
    //   { senderId: selectedUserId, receiverId: myId, seen: true },
    // );
    await Message.updateMany(
      { senderId: selectedUserId, receiverId: myId, seen: false },
      { $set: { seen: true } }
    );

    res.status(200).json({
      success: true,
      messages,
    });
  } catch (error) {
    console.log("Get Messages Error:", error.message);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

//api to mark messages as seen using message id

export const markMessageAsSeen = async (req, res) => {
  try {
    const { id } = req.params;
    await Message.findByIdAndUpdate(id, { seen: true });

    res.status(200).json({
      success: true,
      message: "Message marked as seen",
    });
  } catch (error) {
    console.log("Mark Message Seen Error:", error.message);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};


//send message to selected user

export const sendMessage = async (req, res) => {
  try {
    const { text, image } = req.body;
    const receiverId = req.params.id;
    const senderId = req.user._id; // from auth middleware

    const userExists = await User.findById(receiverId);
    if (!userExists) {
      return res.status(404).json({
        success: false,
        message: "Receiver not found",
      });
    }

    if (!text && !image) {
      return res.status(400).json({
        success: false,
        message: "Message cannot be empty",
      });
    }

    let imageUrl;
    // let imageUrl = "";

    // upload image if exists
    if (image) {
      const uploadResponse = await cloudinary.uploader.upload(image);
      imageUrl = uploadResponse.secure_url;
    }

    const newMessage = await Message.create({
      senderId,
      receiverId,
      text,
      image: imageUrl,
    });

    // Emit new message to receiver socket if online
    const receiverSocketId = userSocketMap[receiverId];
    if (receiverSocketId) {
      io.to(receiverSocketId).emit("newMessage", newMessage);
    }


    res.status(201).json({
      success: true,
      message: newMessage,
    });

  } catch (error) {
    console.log("Send Message Error:", error.message);
    res.status(500).json({
      success: false,
      message: "Internal Server Error",
    });
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
      return res.status(404).json({
        success: false,
        message: "Message not found",
      });
    }

    if (delete_for_everyone) {
      // Only sender can delete for everyone
      if (message.senderId.toString() !== myId.toString()) {
        return res.status(403).json({
          success: false,
          message: "You can only delete your own messages for everyone",
        });
      }

      message.isDeleted = true;
      message.text = "";
      message.image = "";
      await message.save();

      // Notify the other user
      const otherUserId = message.receiverId.toString() === myId.toString() ? message.senderId : message.receiverId;
      const otherUserSocketId = userSocketMap[otherUserId];
      if (otherUserSocketId) {
        io.to(otherUserSocketId).emit("messageDeleted", {
          messageId: id,
        });
      }
    } else {
      // Delete for me
      if (!message.deletedFor.includes(myId)) {
        message.deletedFor.push(myId);
        await message.save();
      }
    }

    res.status(200).json({
      success: true,
      message: "Message deleted successfully",
    });
  } catch (error) {
    console.log("Delete Message Error:", error.message);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};
// Clear all messages in a chat
export const clearChat = async (req, res) => {
  try {
    const { id: selectedUserId } = req.params;
    const myId = req.user._id;

    if (!mongoose.Types.ObjectId.isValid(selectedUserId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid selected user ID",
      });
    }

    // Find all messages between these two users that aren't already hidden for current user
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

    res.status(200).json({
      success: true,
      message: "Chat cleared successfully",
      count: result.modifiedCount,
    });
  } catch (error) {
    console.log("Clear Chat Error:", error.message);
    res.status(500).json({
      success: false,
      message: "Internal Server Error",
    });
  }
};
