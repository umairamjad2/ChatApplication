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





