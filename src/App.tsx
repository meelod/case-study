import React from "react";
import Chat from "./pages/Chat";

const App: React.FC = () => {
    return (
        <div className="bg-gray-50 h-screen flex flex-col overflow-hidden">
            {/* Compact header for side panel */}
            <div className="bg-white shadow-sm border-b border-gray-200 flex items-center justify-between px-4 py-2 flex-shrink-0">
                <div className="flex items-center">
                    <h1 className="text-lg font-bold text-teal-600">PartSelect</h1>
                    <span className="ml-2 text-xs text-gray-500">Assistant</span>
                </div>
                <div className="text-xs text-gray-600 hidden sm:block">
                    Parts Helper
                </div>
            </div>
            <Chat />
        </div>
    );
};

export default App;
