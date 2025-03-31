// client/src/components/ChatMessage.tsx
import React, { useState } from "react";
import ReactMarkdown from "react-markdown";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { atomDark } from "react-syntax-highlighter/dist/esm/styles/prism"; // Or your chosen theme e.g., okaidia, oneDark
import remarkGfm from "remark-gfm";
import {
  FiCopy,
  FiPlay,
  FiCheck,
  FiXCircle,
  FiLoader,
  FiTerminal,
} from "react-icons/fi";
import styles from "./ChatMessage.module.css";

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:3001";

interface ChatMessageProps {
  message: { sender: "user" | "ai"; text: string };
}
interface ExecutionResult {
  stdout: string | null;
  stderr: string | null;
  error: string | null;
}

const ChatMessage: React.FC<ChatMessageProps> = ({ message }) => {
  const [copyState, setCopyState] = useState<"idle" | "copied">("idle");
  const [executing, setExecuting] = useState(false);
  const [showOutput, setShowOutput] = useState(false);
  const [execResult, setExecResult] = useState<ExecutionResult | null>(null);

  const handleCopyCode = (code: string) => {
    navigator.clipboard
      .writeText(code)
      .then(() => {
        setCopyState("copied");
        setTimeout(() => setCopyState("idle"), 1500);
      })
      .catch((err) => console.error("Copy Error:", err));
  };

  const handleRunCode = async (code: string, language: string | undefined) => {
    const targetLanguage = language || "python"; // Default to python if unspecified
    if (
      targetLanguage.toLowerCase() !== "python" &&
      targetLanguage.toLowerCase() !== "py"
    ) {
      alert(`Execution simulation only supports Python currently.`);
      return;
    }
    setExecuting(true);
    setExecResult(null);
    setShowOutput(true);
    console.log(`--- Calling Backend Execute (${targetLanguage}) ---`);

    try {
      const response = await fetch(`${BACKEND_URL}/api/execute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: code, language: targetLanguage }),
      });
      const data: ExecutionResult = await response.json();
      if (!response.ok) {
        throw new Error(
          data?.error || `Exec request failed: ${response.status}`,
        );
      }
      console.log("Exec Result:", data);
      setExecResult(data);
    } catch (error: any) {
      console.error("Exec API Error:", error);
      setExecResult({
        stdout: null,
        stderr: null,
        error: `Frontend Error: ${error.message}`,
      });
    } finally {
      setExecuting(false);
    }
  };

  return (
    <div
      className={`${styles.message} ${message.sender === "user" ? styles.user : styles.ai}`}
    >
      <ReactMarkdown
        children={message.text}
        remarkPlugins={[remarkGfm]}
        components={{
          div({ node, className, children, ...props }: any) {
            if (className === "remark-code-container") {
              const { language, codeString } = props;
              const isPython =
                !language ||
                language.toLowerCase() === "python" ||
                language.toLowerCase() === "py";
              return (
                <div className={styles.codeBlockContainer}>
                  <div className={styles.codeHeader}>
                    <span className={styles.codeLanguage}>
                      {language || "code"}
                    </span>
                    <div className={styles.codeActions}>
                      {isPython && (
                        <button
                          className={styles.iconButton}
                          onClick={() => handleRunCode(codeString, language)}
                          title="Run Code (Simulated)"
                          disabled={executing}
                        >
                          {executing ? (
                            <FiLoader className={styles.spinner} />
                          ) : (
                            <FiPlay />
                          )}
                        </button>
                      )}
                      <button
                        className={styles.iconButton}
                        onClick={() => handleCopyCode(codeString)}
                        title="Copy Code"
                        disabled={copyState === "copied"}
                      >
                        {copyState === "copied" ? <FiCheck /> : <FiCopy />}
                      </button>
                      {copyState === "copied" && (
                        <span className={styles.copyFeedback}>Copied!</span>
                      )}
                    </div>
                  </div>
                  {children} {/* The actual <pre> block */}
                  {isPython && showOutput && (
                    <div className={styles.outputArea}>
                      <div className={styles.outputHeader}>
                        <FiTerminal /> Output{" "}
                        <button
                          className={styles.closeOutputButton}
                          onClick={() => setShowOutput(false)}
                          title="Close Output"
                        >
                          <FiXCircle />
                        </button>
                      </div>
                      {executing ? (
                        <div className={styles.outputContent}>Running...</div>
                      ) : execResult ? (
                        <pre className={styles.outputContent}>
                          {execResult.stdout &&
                            `[stdout]:\n${execResult.stdout}\n`}
                          {execResult.stderr &&
                            `[stderr]:\n${execResult.stderr}\n`}
                          {execResult.error &&
                            `[Execution Error]:\n${execResult.error}`}
                          {!execResult.stdout &&
                            !execResult.stderr &&
                            !execResult.error &&
                            "[No Output]"}
                        </pre>
                      ) : (
                        <div className={styles.outputContent}>
                          Click Run <FiPlay /> to execute (simulated).
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            }
            return <div {...props}>{children}</div>;
          },
          code({ node, inline, className, children, ...props }: any) {
            const match = /language-(\w+)/.exec(className || "");
            const language = match?.[1];
            const codeString = String(children).replace(/\n$/, "");
            if (!inline) {
              return (
                <div
                  className="remark-code-container"
                  {...{ language: language, codeString: codeString }}
                >
                  <pre className={className} {...props}>
                    <SyntaxHighlighter
                      children={codeString}
                      style={atomDark}
                      language={language}
                      PreTag="div"
                    />
                  </pre>
                </div>
              );
            }
            return (
              <code className={className} {...props}>
                {children}
              </code>
            );
          },
        }}
      />
    </div>
  );
};
export default ChatMessage;
