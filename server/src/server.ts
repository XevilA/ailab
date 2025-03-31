// server/src/server.ts
import express, { Request, Response, NextFunction } from "express";
import {
  GoogleGenerativeAI,
  HarmCategory,
  HarmBlockThreshold,
  GenerateContentResponse,
  FinishReason,
  SafetyRating,
} from "@google/generative-ai";
import dotenv from "dotenv";
import cors from "cors";

dotenv.config(); // Load .env file variables

const app = express();
const port = process.env.PORT || 3001;

// --- Configuration ---
const API_KEY = process.env.GOOGLE_API_KEY;
const MODEL_NAME = "gemini-1.5-pro-latest"; // Or your desired Gemini model
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:5173"; // Default for local dev

if (!API_KEY) {
  console.error(
    "CRITICAL ERROR: GOOGLE_API_KEY environment variable is not set.",
  );
  process.exit(1); // Exit if API key is missing
}

// --- Initialize Google Generative AI ---
const genAI = new GoogleGenerativeAI(API_KEY);
const chatModel = genAI.getGenerativeModel({
  model: MODEL_NAME,
  safetySettings: [
    {
      category: HarmCategory.HARM_CATEGORY_HARASSMENT,
      threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
    },
    {
      category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
      threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
    },
    {
      category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
      threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
    },
    {
      category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
      threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
    },
  ],
  generationConfig: {
    temperature: 0.9,
    topK: 1,
    topP: 1,
    maxOutputTokens: 2048,
  },
});

// --- Middleware ---
app.use(
  cors({
    origin: FRONTEND_URL,
  }),
);
console.log(`CORS enabled for origin: ${FRONTEND_URL}`);
app.use(express.json());

// --- API Route: Chat with Gemini ---
app.post(
  "/api/chat",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { prompt } = req.body;
      if (!prompt || typeof prompt !== "string" || prompt.trim() === "") {
        res
          .status(400)
          .json({
            error: "Prompt is required and must be a non-empty string.",
          });
        return;
      }
      console.log(
        "[Chat API] Received prompt:",
        prompt.substring(0, 100) + (prompt.length > 100 ? "..." : ""),
      );

      const result = await chatModel.generateContent(prompt);
      const response: GenerateContentResponse | undefined = result?.response;
      const promptFeedback = response?.promptFeedback;
      const candidate = response?.candidates?.[0];
      const finishReason = candidate?.finishReason;
      const safetyRatings = candidate?.safetyRatings;

      if (promptFeedback?.blockReason) {
        const blockReason = promptFeedback.blockReason;
        console.warn(`[Chat API] Prompt blocked due to: ${blockReason}`);
        res
          .status(400)
          .json({
            error: `Request blocked by safety settings: ${blockReason}`,
          });
        return;
      }

      if (
        finishReason &&
        finishReason !== FinishReason.STOP &&
        finishReason !== FinishReason.MAX_TOKENS
      ) {
        console.warn(`[Chat API] Generation stopped due to: ${finishReason}`);
        let detail = "";
        if (finishReason === FinishReason.SAFETY && safetyRatings) {
          const harmfulCategories = safetyRatings
            .filter(
              (r) => r.probability !== "NEGLIGIBLE" && r.probability !== "LOW",
            )
            .map((r) => `${r.category} (${r.probability})`)
            .join(", ");
          if (harmfulCategories)
            detail = ` Potentially harmful categories detected: ${harmfulCategories}`;
        }
        res
          .status(500)
          .json({
            error: `Generation failed or was stopped: ${finishReason}.${detail}`,
          });
        return;
      }

      const textContent = candidate?.content?.parts?.[0]?.text;
      if (textContent !== undefined && textContent !== null) {
        console.log("[Chat API] Sending successful response.");
        res.json({ response: textContent });
        return;
      } else {
        console.error(
          "[Chat API] Could not extract text content, even though finishReason was",
          finishReason,
        );
        if (safetyRatings) {
          const harmfulCategories = safetyRatings
            .filter(
              (r) => r.probability !== "NEGLIGIBLE" && r.probability !== "LOW",
            )
            .map((r) => r.category)
            .join(", ");
          if (harmfulCategories) {
            console.warn(
              `[Chat API] Warning: Finish reason was ${finishReason}, but no text found. High-probability safety categories: ${harmfulCategories}`,
            );
          }
        }
        res
          .status(500)
          .json({
            error: "Failed to extract valid text content from Gemini response.",
          });
        return;
      }
    } catch (error: any) {
      console.error("[Chat API] Error:", error);
      res
        .status(500)
        .json({ error: "Server error communicating with Gemini API." });
    }
  },
);

// --- API Route: Code Execution (SIMULATED) ---
app.post(
  "/api/execute",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const { code, language } = req.body;
    console.log(`[Execute API] Received request for language: ${language}`);

    if (!code || typeof code !== "string") {
      res
        .status(400)
        .json({
          stdout: null,
          stderr: null,
          error: "Missing or invalid 'code' field.",
        });
      return;
    }
    if (language !== "python") {
      console.warn(`[Execute API] Language '${language}' not supported.`);
      res
        .status(400)
        .json({
          stdout: null,
          stderr: null,
          error: `Language '${language}' not supported for execution (Simulation only supports Python).`,
        });
      return;
    }

    console.warn(
      "[Execute API] SIMULATING Python execution. No real code is being run.",
    );
    try {
      await new Promise((resolve) =>
        setTimeout(resolve, 800 + Math.random() * 1000),
      );
      let simulatedStdout: string | null =
        `Simulated output for code starting with:\n"${code.substring(0, 50)}..."\n(Actual execution disabled for security)`;
      let simulatedStderr: string | null = null;
      let simulatedError: string | null = null;

      if (code.match(/error|exception|raise/i)) {
        simulatedStdout = null;
        simulatedStderr = `Simulated stderr: Code appears to intentionally raise an error.`;
      } else if (code.match(/import\s+\w+/)) {
        simulatedStdout += "\n(Simulated import detected)";
      } else if (code.trim().toLowerCase() === "print('hello world')") {
        simulatedStdout = "hello world";
      } else if (code.trim() === "") {
        simulatedStdout = "(No code to execute)";
      }
      if (code.length > 1000) {
        simulatedStdout = null;
        simulatedStderr = null;
        simulatedError =
          "Simulated Execution Error: Code exceeds simulation length limit.";
        console.warn(`[Execute API] Simulation error: ${simulatedError}`);
        res
          .status(400)
          .json({
            stdout: simulatedStdout,
            stderr: simulatedStderr,
            error: simulatedError,
          });
        return;
      }
      console.log(
        "[Execute API] Simulation complete. Sending simulated results.",
      );
      res
        .status(200)
        .json({
          stdout: simulatedStdout,
          stderr: simulatedStderr,
          error: simulatedError,
        });
    } catch (e: any) {
      console.error("[Execute API] Error during simulation process:", e);
      res
        .status(500)
        .json({
          stdout: null,
          stderr: null,
          error: "Internal server error during simulation.",
        });
    }
  },
);

// --- Basic Health Check Route ---
app.get("/health", (req: Request, res: Response) => {
  res.status(200).send("OK");
});

// --- Error Handling Middleware ---
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  console.error("Unhandled Error caught by middleware:", err.stack);
  if (!res.headersSent) {
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// --- Start Server ---
app.listen(port, () => {
  console.log(`✨ Dotmini AI Lab Backend running`);
  console.log(`   - Listening on port: ${port}`);
  console.log(`   - Accepting requests from: ${FRONTEND_URL}`);
  console.log(`   - Chat Endpoint: POST /api/chat`);
  console.log(`   - Execute Endpoint: POST /api/execute (SIMULATED)`);
  console.log(`   - Health Check: GET /health`);
  if (!process.env.GOOGLE_API_KEY) {
    console.warn("   - WARNING: GOOGLE_API_KEY is not set!");
  }
});
