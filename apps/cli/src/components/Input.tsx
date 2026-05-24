import React, { useState } from "react";
import { Box, Text } from "ink";
import TextInput from "ink-text-input";

interface Props {
  onSubmit: (value: string) => void;
  disabled: boolean;
}

export function Input({ onSubmit, disabled }: Props) {
  const [value, setValue] = useState("");

  function handleSubmit(input: string) {
    const trimmed = input.trim();
    if (!trimmed) return;
    onSubmit(trimmed);
    setValue("");
  }

  if (disabled) {
    return (
      <Box>
        <Text color="yellow">回答中...</Text>
      </Box>
    );
  }

  return (
    <Box>
      <Text bold color="blue">
        You:{" "}
      </Text>
      <TextInput value={value} onChange={setValue} onSubmit={handleSubmit} />
    </Box>
  );
}
