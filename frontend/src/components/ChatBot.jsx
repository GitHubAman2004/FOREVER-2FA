import { useContext, useEffect, useRef, useState } from 'react'
import axios from 'axios'
import { ShopContext } from '../context/ShopContext'

const ChatBot = () => {

  const { backendUrl } = useContext(ShopContext)
  const [open, setOpen] = useState(false)
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [messages, setMessages] = useState([
    { role: 'bot', text: 'Hi! Ask me about our products, returns, or shipping.' }
  ])
  const messagesEndRef = useRef(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, open])

  const sendMessage = async () => {
    const message = input.trim()
    if (!message || loading) return

    setMessages(prev => [...prev, { role: 'user', text: message }])
    setInput('')
    setLoading(true)

    try {
      const response = await axios.post(backendUrl + '/api/chat', { message })
      const reply = response.data.success
        ? response.data.reply
        : "Sorry, something went wrong. Please try again."
      setMessages(prev => [...prev, { role: 'bot', text: reply }])
    } catch (error) {
      console.log(error)
      setMessages(prev => [...prev, { role: 'bot', text: "Sorry, I couldn't reach the server. Please try again." }])
    } finally {
      setLoading(false)
    }
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') sendMessage()
  }

  return (
    <div className='fixed bottom-5 right-5 z-50'>

      {/* Chat window */}
      {open && (
        <div className='mb-3 w-80 sm:w-96 h-[28rem] bg-white border border-gray-300 rounded-lg shadow-xl flex flex-col overflow-hidden'>

          {/* Header */}
          <div className='bg-black text-white px-4 py-3 flex justify-between items-center'>
            <p className='font-medium text-sm'>Forever Support</p>
            <button onClick={() => setOpen(false)} className='text-lg leading-none'>&times;</button>
          </div>

          {/* Messages */}
          <div className='flex-1 overflow-y-auto p-3 space-y-3 bg-gray-50'>
            {messages.map((msg, index) => (
              <div key={index} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[75%] px-3 py-2 rounded-lg text-sm ${msg.role === 'user' ? 'bg-black text-white' : 'bg-white border border-gray-200 text-gray-800'}`}>
                  {msg.text}
                </div>
              </div>
            ))}
            {loading && (
              <div className='flex justify-start'>
                <div className='px-3 py-2 rounded-lg text-sm bg-white border border-gray-200 text-gray-400'>
                  Typing...
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className='border-t border-gray-200 p-2 flex gap-2'>
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              className='flex-1 outline-none text-sm px-2 py-1'
              type='text'
              placeholder='Type your message...'
            />
            <button onClick={sendMessage} disabled={loading} className='bg-black text-white text-sm px-4 py-1 rounded disabled:opacity-50'>
              Send
            </button>
          </div>
        </div>
      )}

      {/* Toggle button */}
      <button
        onClick={() => setOpen(!open)}
        className='ml-auto flex items-center justify-center w-14 h-14 rounded-full bg-black text-white shadow-lg text-2xl'
      >
        {open ? '✕' : '\u{1F4AC}'}
      </button>
    </div>
  )
}

export default ChatBot
