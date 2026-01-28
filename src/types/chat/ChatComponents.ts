import { Message } from "./GptMessage";

export interface MessageBubbleProps {
    message: Message;
    index: number;
    productData: Map<number, any>;
}

export interface MessageContentProps {
    content: string;
    messageIndex: number;
    isUser: boolean;
    productData: Map<number, any>;
}

export interface ChatInputProps {
    input: string;
    onInputChange: (value: string) => void;
    onSend: () => void;
    disabled?: boolean;
    placeholder?: string;
}
