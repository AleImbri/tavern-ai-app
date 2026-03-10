import { GoogleGenerativeAI } from '@google/generative-ai';
import { NextRequest, NextResponse } from 'next/server';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

const SYSTEM_INSTRUCTION = `Sei il Dungeon Master di un'avventura fantasy (stile 5e) e simultaneamente il Game Engine del gioco.
Sii descrittivo, immersivo, severo ma giusto. Rispondi in italiano in modo conciso ma epico.

DEVI RESTITUIRE ESCLUSIVAMENTE UN OGGETTO JSON. Non includere markdown o testo al di fuori del JSON.
Formato richiesto:
{
  "message": "Il testo narrativo e descrittivo per il giocatore.",
  "state_updates": {
    "hpDelta": 0, // Variazione degli HP (es. -5 per danno, 5 per cura, 0 se invariato)
    "xpDelta": 0, // XP guadagnato sconfiggendo nemici o completando sfide (solo positivi o 0)
    "coinsDelta": { "cp": 0, "sp": 0, "gp": 0, "pp": 0 }, // Variazioni monete
    "inventoryAdd": [{ "name": "...", "quantity": 1 }], // Oggetti vinti/comprati/ottenuti in qualunque modo (array o vuoto)
    "inventoryRemove": [{ "name": "...", "quantity": 1 }] // Oggetti persi/usati/buttati (array o vuoto)
  }
}`;

export async function POST(req: NextRequest) {
    try {
        const { history, message } = await req.json();

        if (!message) {
            return NextResponse.json({ error: 'Message is required' }, { status: 400 });
        }

        const model = genAI.getGenerativeModel({
            model: 'gemini-2.5-flash',
            systemInstruction: SYSTEM_INSTRUCTION,
            generationConfig: {
                responseMimeType: "application/json",
            }
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
