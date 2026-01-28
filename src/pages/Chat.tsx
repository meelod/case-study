import React, { useState, useEffect, useRef } from "react";
import { useGPT } from "../hooks/useGPT";
import MessageBubble from "../components/chat/MessageBubble";
import ChatInput from "../components/chat/ChatInput";
import TypingIndicator from "../components/chat/TypingIndicator";

const Chat: React.FC = () => {
    const [input, setInput] = useState<string>("");
    const { messages, productData, isLoading, sendMessage } = useGPT();

    const messagesEndRef = useRef<HTMLDivElement>(null);
    const isInitialMount = useRef(true);

    const scrollToBottom = (): void => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    useEffect(() => {
        // Don't scroll on initial mount, only when new messages are added or loading state changes
        if (isInitialMount.current) {
            isInitialMount.current = false;
            return;
        }
        scrollToBottom();
    }, [messages, isLoading]);

    const handleSend = async (): Promise<void> => {
        const userInput = input.trim();
        if (userInput !== "") {
            setInput("");
            await sendMessage(userInput);
        }
    };

    return (
        <div className="flex-1 flex flex-col bg-gray-50 min-h-0 overflow-hidden">
            <div className="flex-1 min-h-0 overflow-y-auto px-3 py-3">
                {messages.map((message, index) => (
                    <MessageBubble
                        key={index}
                        message={message}
                        index={index}
                        productData={productData}
                    />
                ))}
                {isLoading && (
                    <div className="flex flex-col max-w-[85%] my-2 items-start">
                        <div className="py-2 px-3 my-1 rounded-lg text-sm font-normal leading-normal text-left shadow-sm bg-white text-gray-800 rounded-tl-sm border border-gray-200">
                            <TypingIndicator />
                        </div>
                    </div>
                )}
                <div ref={messagesEndRef} />
            </div>
            <ChatInput
                input={input}
                onInputChange={setInput}
                onSend={handleSend}
                disabled={!input.trim()}
                isLoading={isLoading}
            />
        </div>
    );
};

export default Chat;
