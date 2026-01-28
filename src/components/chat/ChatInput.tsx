import React from "react";
import { ChatInputProps } from "../../types/chat/ChatComponents";

const ChatInput = ({
    input,
    onInputChange,
    onSend,
    disabled = false,
    placeholder = "Ask about refrigerator or dishwasher parts...",
}: ChatInputProps) => {
    const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>): void => {
        if (e.key === "Enter" && !e.shiftKey) {
            onSend();
            e.preventDefault();
        }
    };

    return (
        <div className="text-sm p-4 bottom-0 left-0 right-0 flex border-t border-gray-200 bg-white fixed shadow-lg">
            <input
                value={input}
                onChange={(e) => onInputChange(e.target.value)}
                placeholder={placeholder}
                onKeyDown={handleKeyPress}
                className="flex-1 px-4 py-3 mr-3 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
            />
            <button
                className="px-6 py-3 border-none rounded-lg bg-teal-600 text-white cursor-pointer text-sm font-medium hover:bg-teal-700 transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
                onClick={onSend}
                disabled={disabled}
            >
                Send
            </button>
        </div>
    );
};

export default ChatInput;
