const CHAT_MODEL = "openai/gpt-oss-120b"

// sends a prompt to Groq and returns the generated text
const generateAnswer = async (prompt) => {
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${process.env.GROQ_API_KEY}`
        },
        body: JSON.stringify({
            model: CHAT_MODEL,
            messages: [{ role: "user", content: prompt }]
        })
    })

    if (!response.ok) {
        const error = await response.text()
        throw new Error(`Groq chat completion request failed: ${error}`)
    }

    const data = await response.json()
    return data.choices[0].message.content
}

export default generateAnswer
