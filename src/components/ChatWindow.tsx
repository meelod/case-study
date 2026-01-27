import React, { useState, useEffect, useRef } from "react";
import { getAIMessage } from "../api/api";
import { marked } from "marked";

const ChatWindow: React.FC = () => {
  const defaultMessage = [{
    role: "assistant",
    content: "Hi, how can I help you today?"
  }];

  const [messages, setMessages] = useState(defaultMessage);
  const [input, setInput] = useState<string>("");

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = (): void => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSend = async (userInput: string): Promise<void> => {
    if (userInput.trim() !== "") {
      // Set user message
      setMessages(prevMessages => [...prevMessages, { role: "user", content: userInput }]);
      setInput("");

      // Call API & set assistant message
      const newMessage = await getAIMessage(userInput);
      setMessages(prevMessages => [...prevMessages, newMessage]);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === "Enter" && !e.shiftKey) {
      handleSend(input);
      e.preventDefault();
    }
  };

  return (
    <div className="flex-1 overflow-y-auto p-5 box-border flex flex-col pb-0.5 text-base mt-[60px] mb-[70px]">
      {messages.map((message, index) => (
        <div 
          key={index} 
          className={`flex flex-col max-w-full my-1 ${
            message.role === "user" 
              ? "self-end items-end" 
              : "items-start"
          }`}
        >
          {message.content && (
            <div 
              className={`whitespace-pre-line py-3.5 px-3.5 my-0.5 rounded-[10px] text-sm font-normal leading-[1.4] text-left ${
                message.role === "user"
                  ? "bg-[#1b3875] text-white rounded-tr-none"
                  : "bg-[#f6f6f6] text-black rounded-tl-none w-full"
              }`}
            >
              <div dangerouslySetInnerHTML={{__html: marked(message.content).replace(/<p>|<\/p>/g, "")}} />
            </div>
          )}
        </div>
      ))}
      <div ref={messagesEndRef} />
      <div className="text-[15px] p-2.5 bottom-0 flex border-t border-[#ccc] bg-white fixed w-[calc(100%-40px)]">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Type a message..."
          onKeyPress={handleKeyPress}
          className="flex-1 px-2.5 py-2.5 mr-2.5 rounded-[5px] border border-[#ccc] text-sm"
        />
        <button 
          className="px-5 py-2.5 border-none rounded-[5px] bg-[#121212] text-white cursor-pointer text-sm"
          onClick={() => handleSend(input)}
        >
          Send
        </button>
      </div>
    </div>
  );
};

export default ChatWindow;
