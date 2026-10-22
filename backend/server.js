import 'dotenv/config'
import app from './app.js'
import connectDB from './config/mongodb.js'
import connectCloudinary from './config/cloudinary.js'
import connectRedis from './config/redis.js'

const port = process.env.PORT || 4000
connectDB()
connectCloudinary()
connectRedis()

app.listen(port, ()=> console.log('Server started on PORT : '+ port))
