import OpenAI from "openai";
import dotenv from "dotenv";

dotenv.config();

const client = new OpenAI({
    apiKey: process.env.GROQ_API_KEY,
    baseURL: "https://api.groq.com/openai/v1",
});

export const askAIStream = async (messages, onData) => {

    const stream = await client.chat.completions.create({
        model: "llama-3.3-70b-versatile",
        messages,
        temperature: 0.7,
        max_tokens: 500,
        stream: true
    });

    let fullText = "";

    for await (const chunk of stream) {
        const content = chunk.choices[0]?.delta?.content || "";
        fullText += content;

        if (content) {
            onData(content, fullText);
        }
    }

    return fullText;
};

