import { streamChat } from "@lang-chain-demo/api-client";
import { useEffect, useRef, useState } from "react";
import { ChatInput } from "./components/ChatInput";
import { ChatMessage } from "./components/ChatMessage";
import { Sources } from "./components/Sources";

interface Message {
  role: "user" | "assistant";
  content: string;
  sources?: { source: string; content: string }[];
}

export default function App() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  async function handleSend(message: string) {
    setMessages((prev) => [...prev, { role: "user", content: message }]);
    setIsLoading(true);

    setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

    try {
      let sources: { source: string; content: string }[] = [];

      for await (const event of streamChat(message)) {
        if (event.type === "chunk") {
          setMessages((prev) => {
            const updated = [...prev];
            const last = updated[updated.length - 1];
            if (last) {
              updated[updated.length - 1] = {
                ...last,
                content: last.content + event.content,
              };
            }
            return updated;
          });
        } else if (event.type === "sources") {
          sources = event.sources;
        }
      }

      setMessages((prev) => {
        const updated = [...prev];
        const last = updated[updated.length - 1];
        if (last) {
          updated[updated.length - 1] = { ...last, sources };
        }
        return updated;
      });
    } catch (_error) {
      setMessages((prev) => {
        const updated = [...prev];
        const last = updated[updated.length - 1];
        if (last) {
          updated[updated.length - 1] = {
            ...last,
            content:
              "エラーが発生しました。サーバーが起動しているか確認してください。",
          };
        }
        return updated;
      });
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div
      style={{
        maxWidth: "800px",
        margin: "0 auto",
        height: "100vh",
        display: "flex",
        flexDirection: "column",
        fontFamily: "system-ui, sans-serif",
      }}
    >
      <header
        style={{
          padding: "16px",
          borderBottom: "1px solid #e5e7eb",
          textAlign: "center",
        }}
      >
        <h1 style={{ margin: 0, fontSize: "20px", color: "#1f2937" }}>
          TechFlow 社内Q&A
        </h1>
        <p style={{ margin: "4px 0 0", fontSize: "13px", color: "#6b7280" }}>
          社内ドキュメントに基づいて回答します
        </p>
      </header>

      <div style={{ flex: 1, overflowY: "auto", padding: "16px" }}>
        {messages.length === 0 && (
          <p
            style={{
              textAlign: "center",
              color: "#9ca3af",
              marginTop: "40px",
            }}
          >
            質問を入力してください（例: 「有給休暇の申請方法は？」）
          </p>
        )}
        {messages.map((msg, i) => (
          <div key={i}>
            <ChatMessage role={msg.role} content={msg.content} />
            {msg.sources && <Sources sources={msg.sources} />}
          </div>
        ))}
        {isLoading && (
          <div style={{ color: "#9ca3af", fontSize: "13px" }}>回答中...</div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <ChatInput onSend={handleSend} disabled={isLoading} />
    </div>
  );
}
