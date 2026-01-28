import React from "react";
import { ChatInputProps } from "../../types/chat/ChatComponents";

const ChatInput = ({
    input,
    onInputChange,
    onSend,
    disabled = false,
    isLoading = false,
    placeholder = "Ask about refrigerator or dishwasher parts...",
}: ChatInputProps) => {
    const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>): void => {
        if (e.key === "Enter" && !e.shiftKey) {
            onSend();
            e.preventDefault();
        }
    };

    return (
        <div className="text-sm p-2 flex-shrink-0 border-t border-gray-200 bg-white shadow-sm">
            <div className="flex gap-2">
                <input
                    value={input}
                    onChange={(e) => onInputChange(e.target.value)}
                    placeholder={placeholder}
                    onKeyDown={handleKeyPress}
                    disabled={isLoading}
                    className="flex-1 px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent disabled:bg-gray-100 disabled:cursor-not-allowed"
                />
                <button
                    className="px-4 py-2 border-none rounded-lg bg-teal-600 text-white cursor-pointer text-sm font-medium hover:bg-teal-700 transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center min-w-[70px]"
                    onClick={onSend}
                    disabled={disabled || isLoading}
                >
                    {isLoading ? (
                        <span className="flex items-center">
                            <svg className="animate-spin -ml-1 mr-1 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                            <span className="text-xs">...</span>
                        </span>
                    ) : (
                        "Send"
                    )}
                </button>
            </div>
        </div>
    );
};

export default ChatInput;
