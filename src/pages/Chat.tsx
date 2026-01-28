import React, { useState, useEffect, useRef } from "react";
import { getAIMessage, getProductByPartNumber } from "../api/api";
import { Message } from "../types/chat/Message";
import { extractPartNumbersFromText } from "../utils/productExtractor";
import MessageBubble from "../components/chat/MessageBubble";
import ChatInput from "../components/chat/ChatInput";

const Chat: React.FC = () => {
    const defaultMessage: Message[] = [
        {
            role: "assistant",
            content: "Hi, how can I help you today?",
        },
    ];

    const [messages, setMessages] = useState<Message[]>(defaultMessage);
    const [input, setInput] = useState<string>("");
    const [productData, setProductData] = useState<Map<number, any>>(new Map());

    const messagesEndRef = useRef<HTMLDivElement>(null);
    const isInitialMount = useRef(true);

    const scrollToBottom = (): void => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    useEffect(() => {
        // Don't scroll on initial mount, only when new messages are added
        if (isInitialMount.current) {
            isInitialMount.current = false;
            return;
        }
        scrollToBottom();
    }, [messages]);

    const handleSend = async (userInput: string): Promise<void> => {
        if (userInput.trim() !== "") {
            // Capture current length so we can consistently associate product cards with the
            // assistant message that will be appended after the user message.
            // This avoids React.StrictMode double-invoking setState updaters causing duplicated cards.
            const baseIndex = messages.length;
            const assistantIndex = baseIndex + 1;

            // Set user message
            setMessages((prevMessages) => [
                ...prevMessages,
                { role: "user", content: userInput },
            ]);
            setInput("");

            // Call API & set assistant message
            const newMessage = await getAIMessage(userInput);
            setMessages((prevMessages) => [...prevMessages, newMessage]);

            // Extract part numbers from assistant response and fetch product data (deduped)
            const partNumbers = Array.from(
                new Set(extractPartNumbersFromText(newMessage.content))
            );
            if (partNumbers.length > 0) {
                Promise.all(
                    partNumbers.map((partNumber) => getProductByPartNumber(partNumber))
                ).then((products) => {
                    const validProducts = products
                        .filter(Boolean)
                        // De-dupe by part number to prevent repeated cards
                        .filter(
                            (p: any, idx: number, arr: any[]) =>
                                idx === arr.findIndex((x) => x?.partNumber === p?.partNumber)
                        );

                    if (validProducts.length > 0) {
                        setProductData((prev) => {
                            const newMap = new Map(prev);
                            newMap.set(assistantIndex, validProducts);
                            return newMap;
                        });
                    }
                });
            }
        }
    };

    return (
        <div className="flex-1 overflow-y-auto p-6 box-border flex flex-col pb-0 text-base mt-[60px] mb-[80px] bg-gray-50 h-[calc(100vh-60px-80px)]">
            {messages.map((message, index) => (
                <MessageBubble
                    key={index}
                    message={message}
                    index={index}
                    productData={productData}
                />
            ))}
            <div ref={messagesEndRef} />
            <ChatInput
                input={input}
                onInputChange={setInput}
                onSend={() => handleSend(input)}
                disabled={!input.trim()}
            />
        </div>
    );
};

export default Chat;
