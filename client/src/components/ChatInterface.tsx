// client/src/components/ChatInterface.tsx
import React, {
  useState,
  useRef,
  useEffect,
  FormEvent,
  ChangeEvent,
} from "react";
import ChatMessage from "./ChatMessage";
import styles from "./ChatInterface.module.css";
import { FiTrash2 } from "react-icons/fi"; // <--- เหลือแค่นี้

interface Message {
  id: number;
  sender: "user" | "ai";
  text: string;
}

interface ApiError {
  error: string;
  details?: string;
}

const CHAT_STORAGE_KEY = "dotminiAiLabChatHistory";
const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:3001";

const ChatInterface: React.FC = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Load/Save History Effects
  useEffect(() => {
    try {
      const stored = localStorage.getItem(CHAT_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          setMessages(parsed);
        } else {
          localStorage.removeItem(CHAT_STORAGE_KEY);
        }
      }
    } catch (error) {
      console.error("LS Load Error:", error);
      localStorage.removeItem(CHAT_STORAGE_KEY);
    }
  }, []);

  useEffect(() => {
    if (messages.length > 0 || localStorage.getItem(CHAT_STORAGE_KEY)) {
      try {
        localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(messages));
      } catch (error) {
        console.error("LS Save Error:", error);
      }
    }
  }, [messages]);

  // Scroll & Textarea Effects
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);
  useEffect(() => {
    const ta = textareaRef.current;
    if (ta) {
      ta.style.height = "auto";
      ta.style.height = `${ta.scrollHeight}px`;
    }
  }, [input]);

  // Handlers
  const handleInputChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
    setInput(event.target.value);
  };
  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      handleSend();
    }
  };
  const handleClearChat = () => {
    if (window.confirm("Clear chat history?")) {
      setMessages([]);
      localStorage.removeItem(CHAT_STORAGE_KEY);
    }
  };

  const handleSend = async (event?: FormEvent) => {
    if (event) event.preventDefault();
    const userMessageText = input.trim();
    if (!userMessageText || isLoading) return;

    const newUserMessage: Message = {
      id: Date.now(),
      sender: "user",
      text: userMessageText,
    };
    setMessages((prev) => [...prev, newUserMessage]);
    setInput("");
    setIsLoading(true);
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }

    try {
      const response = await fetch(`${BACKEND_URL}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: userMessageText }),
      });
      if (!response.ok) {
        let err: ApiError = { error: `HTTP ${response.status}` };
        try {
          err = await response.json();
        } catch {}
        throw new Error(err.error);
      }
      const data = await response.json();
      const aiMessage: Message = {
        id: Date.now() + 1,
        sender: "ai",
        text: data.response || "No response text.",
      };
      setMessages((prev) => [...prev, aiMessage]);
    } catch (error: any) {
      console.error("Fetch Error:", error);
      const errorMessage: Message = {
        id: Date.now() + 1,
        sender: "ai",
        text: `⚠️ Error: ${error.message}`,
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  // Render
  return (
    <>
      {messages.length > 0 && (
        <button
          onClick={handleClearChat}
          className={styles.clearButton}
          title="Clear Chat History"
        >
          <FiTrash2 /> Clear Chat
        </button>
      )}
      <div className={styles.chatContainer}>
        {messages.length === 0 && !isLoading && (
          <div className={styles.emptyState}>Ask Dotmini AI anything...</div>
        )}
        {messages.map((msg) => (
          <ChatMessage key={msg.id} message={msg} />
        ))}
        {isLoading && (
          <div className={styles.loadingIndicator}>
            Dotmini AI is thinking...
          </div>
        )}
        <div ref={chatEndRef} />
      </div>
      <form className={styles.inputArea} onSubmit={handleSend}>
        <textarea
          ref={textareaRef}
          className={styles.inputField}
          value={input}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          placeholder="Ask Dotmini AI anything..."
          rows={1}
          disabled={isLoading}
        />
        <button
          type="submit"
          className={styles.sendButton}
          disabled={isLoading || !input.trim()}
        >
          Send
        </button>
      </form>
    </>
  );
};
export default ChatInterface;
