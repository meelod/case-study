import React from "react";
import { MessageBubbleProps } from "../../types/chat/ChatComponents";
import MessageContent from "./MessageContent";

const MessageBubble = ({ message, index, productData }: MessageBubbleProps) => {
    const isUser = message.role === "user";

    return (
        <div
            className={`flex flex-col max-w-[85%] my-2 ${isUser ? "self-end items-end ml-auto" : "items-start"
                }`}
        >
            {message.content && (
                <div
                    className={`py-2.5 px-3.5 my-1 rounded-lg text-sm font-normal leading-normal text-left shadow-sm ${isUser
                        ? "bg-teal-600 text-white rounded-tr-sm"
                        : "bg-white text-gray-800 rounded-tl-sm border border-gray-200"
                        }`}
                >
                    <MessageContent
                        content={message.content}
                        messageIndex={index}
                        isUser={isUser}
                        productData={productData}
                    />
                </div>
            )}
        </div>
    );
};

export default MessageBubble;
