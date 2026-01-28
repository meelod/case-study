import React from "react";
import ChatWindow from "./components/ChatWindow";

const App: React.FC = () => {
    return (
        <div className="bg-gray-50 min-h-screen">
            <div className="fixed top-0 left-0 w-full bg-white shadow-md border-b border-gray-200 flex items-center justify-between px-6 h-[60px] z-50">
                <div className="flex items-center">
                    <h1 className="text-xl font-bold text-teal-600">PartSelect</h1>
                    <span className="ml-3 text-sm text-gray-500">Assistant</span>
                </div>
                <div className="text-sm text-gray-600">
                    Refrigerator & Dishwasher Parts
                </div>
            </div>
            <ChatWindow />
        </div>
    );
};

export default App;
