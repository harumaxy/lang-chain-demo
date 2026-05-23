import { streamChat } from "@lang-chain-demo/api-client";
import { Box, Text } from "ink";
import { useState } from "react";
import { Input } from "./components/Input.tsx";
import { MessageList } from "./components/MessageList.tsx";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  sources?: { source: string; content: string }[];
}

export function App() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  async function handleSubmit(input: string) {
    setMessages((prev) => [
      ...prev,
      { id: crypto.randomUUID(), role: "user", content: input },
    ]);
    setIsLoading(true);

    const assistantId = crypto.randomUUID();
    setMessages((prev) => [
      ...prev,
      { id: assistantId, role: "assistant", content: "" },
    ]);

    try {
      let sources: { source: string; content: string }[] = [];

      // @ts-expect-error Bun-specific option to prevent socket timeout during LLM thinking
      for await (const event of streamChat(input, { timeout: 120_000 })) {
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
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      setMessages((prev) => {
        const updated = [...prev];
        const last = updated[updated.length - 1];
        if (last) {
          updated[updated.length - 1] = {
            ...last,
            content: `エラー: ${errorMessage}`,
          };
        }
        return updated;
      });
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <Box flexDirection="column" padding={1}>
      <Box borderStyle="single" paddingX={1} marginBottom={1}>
        <Text bold>Example 社内Q&A (CLI)</Text>
      </Box>

      <MessageList messages={messages} />
      <Input onSubmit={handleSubmit} disabled={isLoading} />

      <Box marginTop={1}>
        <Text dimColor>Ctrl+C で終了</Text>
      </Box>
    </Box>
  );
}
