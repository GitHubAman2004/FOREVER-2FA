import hybridSearchProducts from "../utils/hybridSearch.js"
import generateAnswer from "../utils/generateAnswer.js"

// store policy, shown to customers on the storefront (frontend/src/components/OurPolicy.jsx)
const STORE_POLICY = `
- Exchange Policy: hassle-free exchanges are offered on all products.
- Return Policy: 7 days free return policy from the date of delivery.
- Customer Support: available 24/7.
`

const buildPrompt = (message, products) => {
    const productContext = products.length
        ? products.map((p) => `- ${p.name} (${p.category}/${p.subCategory}), $${p.price}: ${p.description}`).join("\n")
        : "No matching products found in the catalog."

    return `You are a support assistant for an online clothing store called Forever.
Answer the customer's question using ONLY the information given below. If the answer isn't in this information, say you don't know and suggest they contact support.

Store policy:
${STORE_POLICY}

Relevant products:
${productContext}

Customer question: ${message}

Answer concisely and in a friendly tone.`
}

// function for RAG-based support chat
const chatWithBot = async (req, res) => {
    try {

        const { message } = req.body
        const products = await hybridSearchProducts(message, 5)
        const prompt = buildPrompt(message, products)
        const reply = await generateAnswer(prompt)

        res.json({ success: true, reply })

    } catch (error) {
        console.log(error)
        res.json({ success: false, message: error.message })
    }
}

export { chatWithBot }
