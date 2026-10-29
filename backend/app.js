import express from 'express'
import cors from 'cors'
import userRouter from './routes/userRoute.js'
import productRouter from './routes/productRoute.js'
import cartRouter from './routes/cartRoute.js'
import orderRouter from './routes/orderRoute.js'
import chatRouter from './routes/chatRoute.js'

// App Config - no db connection or listen here, so tests can import the app on its own
const app = express()

// middlewares
app.use(express.json())
app.use(cors())

// api endpoints
app.use('/api/user',userRouter)
app.use('/api/product',productRouter)
app.use('/api/cart',cartRouter)
app.use('/api/order',orderRouter)
app.use('/api/chat',chatRouter)

app.get('/',(req,res)=>{
    res.send("API Working")
})

export default app
