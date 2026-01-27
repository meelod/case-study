import React from "react";
import ChatWindow from "./components/ChatWindow";

const App: React.FC = () => {
  return (
    <div className="bg-white">
      <div className="fixed top-0 left-0 w-full bg-white shadow-[0px_2px_4px_rgba(0,0,0,0.1)] flex font-bold text-base justify-center items-center h-[60px]">
        Instalily Case Study
      </div>
      <ChatWindow />
    </div>
  );
};

export default App;
