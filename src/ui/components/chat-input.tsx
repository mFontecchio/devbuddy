import React, { useState } from "react";
import { Text } from "ink";
import TextInput from "ink-text-input";

interface ChatInputProps {
  onSubmit: (text: string) => void;
}

export function ChatInput({ onSubmit }: ChatInputProps) {
  const [value, setValue] = useState("");

  return (
    <>
      <Text color="cyan" bold>Chat: </Text>
      <TextInput
        value={value}
        onChange={setValue}
        onSubmit={(text) => {
          onSubmit(text);
          setValue("");
        }}
        placeholder="Type a message and press Enter..."
      />
    </>
  );
}
