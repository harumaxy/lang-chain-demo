import { Box, Text } from "ink";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  sources?: { source: string; content: string }[];
}

interface Props {
  messages: Message[];
}

export function MessageList({ messages }: Props) {
  return (
    <Box flexDirection="column">
      {messages.map((msg) => (
        <Box key={msg.id} flexDirection="column" marginBottom={1}>
          <Text bold color={msg.role === "user" ? "blue" : "green"}>
            {msg.role === "user" ? "You" : "AI"}:
          </Text>
          <Box marginLeft={2}>
            <Text wrap="wrap">{msg.content}</Text>
          </Box>
          {msg.sources && msg.sources.length > 0 && (
            <Box marginLeft={2} marginTop={0}>
              <Text dimColor>
                [参照: {msg.sources.map((s) => s.source).join(", ")}]
              </Text>
            </Box>
          )}
        </Box>
      ))}
    </Box>
  );
}
