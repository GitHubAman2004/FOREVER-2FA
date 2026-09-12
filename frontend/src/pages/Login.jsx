import React, { useContext, useEffect, useRef, useState } from 'react'
import { ShopContext } from '../context/ShopContext';
import axios from 'axios';
import { toast } from 'react-toastify';

const OTP_LENGTH = 6

const Login = () => {

  const [currentState, setCurrentState] = useState('Login');
  const { token, setToken, navigate, backendUrl } = useContext(ShopContext)

  const [name,setName] = useState('')
  const [password,setPasword] = useState('')
  const [email,setEmail] = useState('')
  const [loading,setLoading] = useState(false)

  // two factor step
  const [otpToken,setOtpToken] = useState('')
  const [maskedEmail,setMaskedEmail] = useState('')
  const [otpDigits,setOtpDigits] = useState(Array(OTP_LENGTH).fill(''))
  const [resendIn,setResendIn] = useState(0)
  const otpInputs = useRef([])

  const saveToken = (newToken) => {
    setToken(newToken)
    localStorage.setItem('token',newToken)
  }

  const startOtpStep = (data) => {
    setOtpToken(data.otpToken)
    setMaskedEmail(data.email || '')
    setOtpDigits(Array(OTP_LENGTH).fill(''))
    setResendIn(60)
    toast.info(data.message || 'Verification code sent to your email')
  }

  const backToLogin = () => {
    setOtpToken('')
    setOtpDigits(Array(OTP_LENGTH).fill(''))
    setPasword('')
    setResendIn(0)
  }

  const onSubmitHandler = async (event) => {
      event.preventDefault();
      setLoading(true)
      try {
        if (currentState === 'Sign Up') {

          const response = await axios.post(backendUrl + '/api/user/register',{name,email,password})
          if (response.data.success) {
            saveToken(response.data.token)
          } else {
            toast.error(response.data.message)
          }

        } else {

          const response = await axios.post(backendUrl + '/api/user/login', {email,password})
          if (response.data.success) {
            if (response.data.twoFactorRequired) {
              startOtpStep(response.data)
            } else {
              saveToken(response.data.token)
            }
          } else {
            toast.error(response.data.message)
          }

        }


      } catch (error) {
        console.log(error)
        toast.error(error.message)
      } finally {
        setLoading(false)
      }
  }

  const onVerifyHandler = async (event) => {
      event.preventDefault();
      const otp = otpDigits.join('')
      if (otp.length !== OTP_LENGTH) {
        toast.error('Please enter the 6 digit code')
        return
      }
      setLoading(true)
      try {

        const response = await axios.post(backendUrl + '/api/user/verify-otp', {otpToken, otp})
        if (response.data.success) {
          saveToken(response.data.token)
        } else {
          toast.error(response.data.message)
          setOtpDigits(Array(OTP_LENGTH).fill(''))
          otpInputs.current[0]?.focus()
          if (response.data.sessionExpired) {
            backToLogin()
          }
        }

      } catch (error) {
        console.log(error)
        toast.error(error.message)
      } finally {
        setLoading(false)
      }
  }

  const onResendHandler = async () => {
      if (resendIn > 0 || loading) {
        return
      }
      setLoading(true)
      try {

        const response = await axios.post(backendUrl + '/api/user/resend-otp', {otpToken})
        if (response.data.success) {
          setOtpToken(response.data.otpToken)
          setOtpDigits(Array(OTP_LENGTH).fill(''))
          setResendIn(60)
          otpInputs.current[0]?.focus()
          toast.info(response.data.message)
        } else {
          toast.error(response.data.message)
          if (response.data.sessionExpired) {
            backToLogin()
          }
        }

      } catch (error) {
        console.log(error)
        toast.error(error.message)
      } finally {
        setLoading(false)
      }
  }

  const onOtpChange = (index, value) => {
    const digits = value.replace(/\D/g,'')
    if (!digits) {
      // handles clearing the box
      setOtpDigits(prev => prev.map((d,i)=> i === index ? '' : d))
      return
    }
    // typing one digit moves forward, pasting a full code fills the rest
    setOtpDigits(prev => {
      const next = [...prev]
      for (let i = 0; i < digits.length && index + i < OTP_LENGTH; i++) {
        next[index + i] = digits[i]
      }
      return next
    })
    const nextIndex = Math.min(index + digits.length, OTP_LENGTH - 1)
    otpInputs.current[nextIndex]?.focus()
  }

  const onOtpKeyDown = (index, event) => {
    if (event.key === 'Backspace' && !otpDigits[index] && index > 0) {
      otpInputs.current[index - 1]?.focus()
    }
  }

  useEffect(()=>{
    if (token) {
      navigate('/')
    }
  },[token])

  useEffect(()=>{
    if (resendIn <= 0) {
      return
    }
    const timer = setInterval(()=> setResendIn(prev => prev - 1), 1000)
    return ()=> clearInterval(timer)
  },[resendIn])

  useEffect(()=>{
    if (otpToken) {
      otpInputs.current[0]?.focus()
    }
  },[otpToken])

  if (otpToken) {
    return (
      <form onSubmit={onVerifyHandler} className='flex flex-col items-center w-[90%] sm:max-w-96 m-auto mt-14 gap-4 text-gray-800'>
          <div className='inline-flex items-center gap-2 mb-2 mt-10'>
              <p className='prata-regular text-3xl'>Verify</p>
              <hr className='border-none h-[1.5px] w-8 bg-gray-800' />
          </div>
          <p className='w-full text-sm text-gray-600 text-center'>Enter the 6 digit code we sent to {maskedEmail || 'your email'}</p>
          <div className='flex justify-between w-full gap-2'>
            {otpDigits.map((digit,index)=>(
              <input
                key={index}
                ref={(el)=> otpInputs.current[index] = el}
                value={digit}
                onChange={(e)=> onOtpChange(index, e.target.value)}
                onKeyDown={(e)=> onOtpKeyDown(index, e)}
                onFocus={(e)=> e.target.select()}
                type="text"
                inputMode='numeric'
                autoComplete={index === 0 ? 'one-time-code' : 'off'}
                maxLength={OTP_LENGTH}
                className='w-full aspect-square text-center text-lg border border-gray-800 outline-none'
              />
            ))}
          </div>
          <div className='w-full flex justify-between text-sm mt-[-8px]'>
              <p onClick={backToLogin} className='cursor-pointer'>Back to login</p>
              <p onClick={onResendHandler} className={resendIn > 0 ? 'text-gray-400' : 'cursor-pointer'}>
                {resendIn > 0 ? `Resend in ${resendIn}s` : 'Resend code'}
              </p>
          </div>
          <button disabled={loading} className='bg-black text-white font-light px-8 py-2 mt-4 disabled:opacity-60'>{loading ? 'Verifying...' : 'Verify'}</button>
      </form>
    )
  }

  return (
    <form onSubmit={onSubmitHandler} className='flex flex-col items-center w-[90%] sm:max-w-96 m-auto mt-14 gap-4 text-gray-800'>
        <div className='inline-flex items-center gap-2 mb-2 mt-10'>
            <p className='prata-regular text-3xl'>{currentState}</p>
            <hr className='border-none h-[1.5px] w-8 bg-gray-800' />
        </div>
        {currentState === 'Login' ? '' : <input onChange={(e)=>setName(e.target.value)} value={name} type="text" className='w-full px-3 py-2 border border-gray-800' placeholder='Name' required/>}
        <input onChange={(e)=>setEmail(e.target.value)} value={email} type="email" className='w-full px-3 py-2 border border-gray-800' placeholder='Email' required/>
        <input onChange={(e)=>setPasword(e.target.value)} value={password} type="password" className='w-full px-3 py-2 border border-gray-800' placeholder='Password' required/>
        <div className='w-full flex justify-between text-sm mt-[-8px]'>
            <p className=' cursor-pointer'>Forgot your password?</p>
            {
              currentState === 'Login'
              ? <p onClick={()=>setCurrentState('Sign Up')} className=' cursor-pointer'>Create account</p>
              : <p onClick={()=>setCurrentState('Login')} className=' cursor-pointer'>Login Here</p>
            }
        </div>
        <button disabled={loading} className='bg-black text-white font-light px-8 py-2 mt-4 disabled:opacity-60'>{loading ? 'Please wait...' : currentState === 'Login' ? 'Sign In' : 'Sign Up'}</button>
    </form>
  )
}

export default Login
