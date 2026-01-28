import React, { useState, useEffect, useRef } from "react";
import { getAIMessage } from "../api/api";
import { marked } from "marked";
import { Message } from "../types/chat/Message";

const ChatWindow: React.FC = () => {
    const defaultMessage: Message[] = [{
        role: "assistant",
        content: "Hi, how can I help you today?"
    }];

    const [messages, setMessages] = useState<Message[]>(defaultMessage);
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
        <div className="flex-1 overflow-y-auto p-6 box-border flex flex-col pb-0 text-base mt-[60px] mb-[80px] bg-gray-50 min-h-screen">
            {messages.map((message, index) => (
                <div
                    key={index}
                    className={`flex flex-col max-w-[85%] my-2 ${message.role === "user"
                        ? "self-end items-end ml-auto"
                        : "items-start"
                        }`}
                >
                    {message.content && (
                        <div
                            className={`whitespace-pre-line py-3 px-4 my-1 rounded-lg text-sm font-normal leading-relaxed text-left shadow-sm ${message.role === "user"
                                ? "bg-teal-600 text-white rounded-tr-sm"
                                : "bg-white text-gray-800 rounded-tl-sm border border-gray-200"
                                }`}
                        >
                            <div
                                className={`max-w-none ${message.role === "user" ? "text-white prose-invert" : "prose prose-sm"}`}
                                dangerouslySetInnerHTML={{ __html: marked(message.content).replace(/<p>|<\/p>/g, "") }}
                            />
                        </div>
                    )}
                </div>
            ))}
            <div ref={messagesEndRef} />
            <div className="text-sm p-4 bottom-0 left-0 right-0 flex border-t border-gray-200 bg-white fixed shadow-lg">
                <input
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder="Ask about refrigerator or dishwasher parts..."
                    onKeyDown={handleKeyPress}
                    className="flex-1 px-4 py-3 mr-3 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                />
                <button
                    className="px-6 py-3 border-none rounded-lg bg-teal-600 text-white cursor-pointer text-sm font-medium hover:bg-teal-700 transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
                    onClick={() => handleSend(input)}
                    disabled={!input.trim()}
                >
                    Send
                </button>
            </div>
        </div>
    );
};

export default ChatWindow;
