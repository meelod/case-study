import React from "react";

const TypingIndicator = () => {
    return (
        <div className="flex items-center space-x-1 py-2 px-3">
            <div className="flex space-x-1">
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "0ms" }}></div>
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "150ms" }}></div>
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "300ms" }}></div>
            </div>
            <span className="text-xs text-gray-500 ml-2">Thinking...</span>
        </div>
    );
};

export default TypingIndicator;
