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

dotenv.config();

const app = express();
const port = process.env.PORT || 3001;

const API_KEY = process.env.GOOGLE_API_KEY;
const MODEL_NAME = "gemini-1.5-pro-latest";
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:5173";

if (!API_KEY) {
  console.error(
    "CRITICAL ERROR: GOOGLE_API_KEY environment variable is not set.",
  );
  process.exit(1);
}

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

app.use((req, res, next) => {
  console.log(`[DEBUG] Incoming Request Origin: ${req.headers.origin}`);
  console.log(`[DEBUG] Request Path: ${req.method} ${req.path}`);
  next();
});
app.use(
  cors({
    origin: FRONTEND_URL,
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  }),
);
console.log(`[INFO] CORS configured to allow origin: ${FRONTEND_URL}`);
app.use(express.json());

app.post(
  "/api/chat",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    console.log("[INFO] --- /api/chat endpoint hit! ---");
    try {
      const { prompt } = req.body;
      if (!prompt || typeof prompt !== "string" || prompt.trim() === "") {
        console.warn(
          "[WARN] /api/chat: Bad Request - Prompt is missing or invalid.",
        );
        res
          .status(400)
          .json({
            error: "Prompt is required and must be a non-empty string.",
          });
        return;
      }
      console.log(
        "[INFO] /api/chat: Received prompt (start):",
        prompt.substring(0, 50) + (prompt.length > 50 ? "..." : ""),
      );

      const result = await chatModel.generateContent(prompt);
      const response: GenerateContentResponse | undefined = result?.response;
      const promptFeedback = response?.promptFeedback;
      const candidate = response?.candidates?.[0];
      const finishReason = candidate?.finishReason;
      const safetyRatings = candidate?.safetyRatings;

      if (promptFeedback?.blockReason) {
        const blockReason = promptFeedback.blockReason;
        console.warn(
          `[WARN] /api/chat: Prompt blocked by safety settings. Reason: ${blockReason}`,
        );
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
        console.warn(
          `[WARN] /api/chat: Generation stopped abnormally. Reason: ${finishReason}`,
        );
        let detail = "";
        if (finishReason === FinishReason.SAFETY && safetyRatings) {
          const harmfulCategories = safetyRatings
            .filter(
              (r: SafetyRating) =>
                r.probability !== "NEGLIGIBLE" && r.probability !== "LOW",
            )
            .map((r: SafetyRating) => `${r.category}(${r.probability})`)
            .join(", ");
          if (harmfulCategories)
            detail = ` Harmful categories detected: ${harmfulCategories}`;
          console.warn(`[WARN] /api/chat: Safety block details: ${detail}`);
        }
        res
          .status(500)
          .json({
            error: `Generation failed or stopped: ${finishReason}.${detail}`,
          });
        return;
      }
      const textContent = candidate?.content?.parts?.[0]?.text;
      if (textContent !== undefined && textContent !== null) {
        console.log("[INFO] /api/chat: Sending successful response to client.");
        res.json({ response: textContent });
        return;
      } else {
        console.error(
          "[ERROR] /api/chat: Could not extract text content from Gemini response. Finish reason:",
          finishReason,
        );
        if (safetyRatings) {
          const harmfulCategories = safetyRatings
            .filter(
              (r: SafetyRating) =>
                r.probability !== "NEGLIGIBLE" && r.probability !== "LOW",
            )
            .map((r: SafetyRating) => r.category)
            .join(", ");
          if (harmfulCategories) {
            console.warn(
              `[WARN] /api/chat: No text found despite finish reason ${finishReason}. High-prob safety categories: ${harmfulCategories}`,
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
      console.error(
        "[ERROR] /api/chat: Unhandled error in route handler:",
        error,
      );
      res
        .status(500)
        .json({ error: "Server error while communicating with Gemini API." });
    }
  },
);

app.post(
  "/api/execute",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    console.log("[INFO] --- /api/execute endpoint hit! ---");
    const { code, language } = req.body;
    console.log(
      `[INFO] /api/execute: Received request for language: ${language}`,
    );

    if (!code || typeof code !== "string") {
      console.warn(
        "[WARN] /api/execute: Bad Request - Code is missing or invalid.",
      );
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
      console.warn(
        `[WARN] /api/execute: Language '${language}' not supported.`,
      );
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
      "[WARN] /api/execute: SIMULATING Python execution. No real code is being run.",
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
        simulatedStderr = `Simulated stderr: Code might raise an error.`;
      } else if (code.match(/import\s+\w+/)) {
        simulatedStdout += "\n(Simulated import detected)";
      } else if (code.trim().toLowerCase() === "print('hello world')") {
        simulatedStdout = "hello world";
      } else if (code.trim() === "") {
        simulatedStdout = "(No code to execute)";
      }

      if (code.length > 1000) {
        simulatedStdout = null; // ต้องประกาศค่าก่อนใช้ในบรรทัดล่าง (แม้จะเป็น null)
        simulatedStderr = null; // ต้องประกาศค่าก่อนใช้ในบรรทัดล่าง (แม้จะเป็น null)
        simulatedError = "Simulated Execution Error: Code too long.";
        console.warn(
          `[WARN] /api/execute: Simulation error - ${simulatedError}`,
        );
        // VVVVVV แก้ไขแล้ว VVVVVV
        res
          .status(400)
          .json({
            stdout: null,
            stderr: simulatedStderr,
            error: simulatedError,
          });
        // ^^^^^^ แก้ไขแล้ว ^^^^^^
        return;
      }

      console.log("[INFO] /api/execute: Simulation complete. Sending results.");
      res
        .status(200)
        .json({
          stdout: simulatedStdout,
          stderr: simulatedStderr,
          error: simulatedError,
        });
    } catch (e: any) {
      console.error(
        "[ERROR] /api/execute: Error during simulation process:",
        e,
      );
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

app.get("/health", (req: Request, res: Response) => {
  console.log("[INFO] /health endpoint hit!");
  res.setHeader("Cache-Control", "no-cache");
  res.status(200).send("OK");
});
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  console.error("[ERROR] Unhandled Error caught by middleware:", err.stack);
  if (!res.headersSent) {
    res.status(500).json({ error: "Internal Server Error" });
  }
});

app.listen(port, () => {
  console.log(`[INFO] ✨ Dotmini AI Lab Backend running`);
  console.log(`[INFO]    - Listening on port: ${port}`);
  console.log(`[INFO]    - Accepting requests from: ${FRONTEND_URL}`);
  // ... (rest of the startup logs) ...
  if (!process.env.GOOGLE_API_KEY) {
    console.warn("[WARN]    - GOOGLE_API_KEY is not set!");
  } else {
    console.log("[INFO]    - GOOGLE_API_KEY is set.");
  }
});
