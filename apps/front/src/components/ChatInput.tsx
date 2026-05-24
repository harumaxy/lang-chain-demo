import { type FormEvent, useState } from "react";

interface Props {
  onSend: (message: string) => void;
  disabled: boolean;
}

export function ChatInput({ onSend, disabled }: Props) {
  const [input, setInput] = useState("");

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setInput("");
  }

  return (
    <form
      onSubmit={handleSubmit}
      style={{ display: "flex", gap: "8px", padding: "16px" }}
    >
      <input
        type="text"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        placeholder="質問を入力..."
        disabled={disabled}
        style={{
          flex: 1,
          padding: "10px 14px",
          borderRadius: "8px",
          border: "1px solid #d1d5db",
          fontSize: "14px",
          outline: "none",
        }}
      />
      <button
        type="submit"
        disabled={disabled || !input.trim()}
        style={{
          padding: "10px 20px",
          borderRadius: "8px",
          border: "none",
          backgroundColor: disabled ? "#9ca3af" : "#2563eb",
          color: "white",
          cursor: disabled ? "not-allowed" : "pointer",
          fontSize: "14px",
        }}
      >
        送信
      </button>
    </form>
  );
}
