export const getAIMessage = async (userQuery: string): Promise<{ role: string; content: string }> => {
    const message = {
        role: "assistant",
        content: "Connect your backend here...."
    };

    return message;
};
