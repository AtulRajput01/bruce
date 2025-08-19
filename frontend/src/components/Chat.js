import React, { useState, useRef, useEffect } from 'react';

const Chat = ({ testResults, onSendMessage }) => {
  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      content: 'Hello! I\'m your Load Test Assistant. Ask me anything about the test results.'
    }
  ]);
  const [input, setInput] = useState('');
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!input.trim()) return;

    // Add user message
    const userMessage = { role: 'user', content: input };
    setMessages(prev => [...prev, userMessage]);
    setInput('');

    try {
      // Show typing indicator
      setMessages(prev => [...prev, { role: 'assistant', content: '...', isLoading: true }]);
      
      const response = await onSendMessage(input, testResults);
      
      // Remove typing indicator and add assistant's response
      setMessages(prev => [
        ...prev.filter(msg => !msg.isLoading),
        { role: 'assistant', content: response.analysis }
      ]);
    } catch (error) {
      console.error('Error getting response:', error);
      setMessages(prev => [
        ...prev.filter(msg => !msg.isLoading),
        { 
          role: 'assistant', 
          content: 'Sorry, I encountered an error. Please try again later.'
        }
      ]);
    }
  };

  return (
    <div className="chat-container">
      <div className="chat-messages">
        {messages.map((message, index) => (
          <div key={index} className={`message ${message.role}`}>
            <div className="message-content">
              {message.content}
              {message.isLoading && <span className="typing-indicator">|</span>}
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>
      <form onSubmit={handleSubmit} className="chat-input">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask me about the test results..."
        />
        <button type="submit" disabled={!input.trim()}>
          Send
        </button>
      </form>
    </div>
  );
};

export default Chat;
