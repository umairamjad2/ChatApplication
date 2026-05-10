import { askAI } from "./services/aiService.js";
import dotenv from "dotenv";
dotenv.config();

const run = async () => {

    const reply = await askAI("Hello AI");

    console.log(reply);
};

run();