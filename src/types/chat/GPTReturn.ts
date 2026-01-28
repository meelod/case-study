import { Message } from "./GptMessage";

export interface GPTReturn {
    messages: Message[];
    productData: Map<number, any>;
    isLoading: boolean;
    error: string | null;
    sendMessage: (userInput: string) => Promise<void>;
    addMessage: (message: Message) => void;
    reset: () => void;
}
