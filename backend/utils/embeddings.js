const EMBEDDING_MODEL = "gemini-embedding-001"
const EMBEDDING_DIMENSIONS = 768

// returns a vector of numbers representing the meaning of the input text
const getEmbedding = async (text) => {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${EMBEDDING_MODEL}:embedContent?key=${process.env.GEMINI_API_KEY}`

    const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            model: `models/${EMBEDDING_MODEL}`,
            content: { parts: [{ text }] },
            outputDimensionality: EMBEDDING_DIMENSIONS
        })
    })

    if (!response.ok) {
        const error = await response.text()
        throw new Error(`Gemini embeddings request failed: ${error}`)
    }

    const data = await response.json()
    return data.embedding.values
}

export default getEmbedding
