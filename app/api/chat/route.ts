import { GoogleGenerativeAI } from '@google/generative-ai';
import { NextRequest, NextResponse } from 'next/server';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

const SYSTEM_INSTRUCTION = "Sei il Dungeon Master di un'avventura fantasy (stile 5e). Sii descrittivo, immersivo, severo ma giusto. Rispondi in italiano in modo conciso ma epico.";

export async function POST(req: NextRequest) {
    try {
        const { history, message } = await req.json();

        if (!message) {
            return NextResponse.json({ error: 'Message is required' }, { status: 400 });
        }

        const model = genAI.getGenerativeModel({
            model: 'gemini-2.5-flash',
            systemInstruction: SYSTEM_INSTRUCTION
        });

        // 1. Ensure history starts with 'user'
        // 2. Ensure roles alternate strictly
        let validHistory: any[] = [];
        let expectedRole = 'user';

        for (const msg of (history || [])) {
            if (msg.role === expectedRole) {
                // deep copy to avoid mutating original request object just in case
                validHistory.push({ role: msg.role, parts: [{ text: msg.parts[0].text }] });
                expectedRole = expectedRole === 'user' ? 'model' : 'user';
            } else if (msg.role !== expectedRole && validHistory.length > 0) {
                // merge consecutive messages of the same role
                validHistory[validHistory.length - 1].parts[0].text += "\n\n [System Note: The following was added consecutively:] \n\n" + msg.parts[0].text;
            }
        }

        const chat = model.startChat({
            history: validHistory,
        });

        const result = await chat.sendMessage(message);
        const responseText = result.response.text();

        return NextResponse.json({ response: responseText });

    } catch (error) {
        console.error('Error in chat API route:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
